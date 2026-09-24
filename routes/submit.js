const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { generateQR } = require('../services/qrcode');
const { generateHash, logAction, detectAnomaly } = require('../services/security');
const { notifyGroup } = require('../services/notify');

function amountToChinese(num) {
  const cn = ['零','壹','贰','叁','肆','伍','陆','柒','捌','玖'];
  const unit = ['元','拾','佰','仟','万','拾','佰','仟','亿'];
  const str = Math.floor(num).toString();
  let result = '';
  for (let i = 0; i < str.length; i++) {
    result += cn[parseInt(str[i])] + unit[str.length - 1 - i];
  }
  if (num % 1 !== 0) {
    const dec = Math.round((num % 1) * 100);
    result += cn[Math.floor(dec/10)] + '角' + cn[dec%10] + '分';
  } else {
    result += '整';
  }
  return result;
}

router.post('/submit', async (req, res) => {
  const {
    bizType, submitterId, submitterName, submitterDept,
    amount, counterpartyName, counterpartyMobile, counterpartyAccount,
    targetBranch, purpose, remark, deviceInfo
  } = req.body;

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  if (!bizType || !submitterName || !amount || !counterpartyName || !targetBranch) {
    return res.json({ success: false, msg: '必填字段缺失' });
  }
  if (bizType !== 'withdraw' && bizType !== 'deposit') {
    return res.json({ success: false, msg: '业务类型无效' });
  }
  const maxAmount = parseFloat(process.env.MAX_AMOUNT || '1000000');
  if (amount <= 0 || amount > maxAmount) {
    return res.json({ success: false, msg: '金额异常' });
  }

  // ====== 余额查询：取款时检查可用余额 ======
  let balanceInfo = null;
  if (bizType === 'withdraw') {
    const balStats = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN biz_type='deposit' AND status='verified' THEN amount ELSE 0 END), 0) as total_deposited,
        COALESCE(SUM(CASE WHEN biz_type='withdraw' AND status='verified' THEN amount ELSE 0 END), 0) as total_withdrawn,
        COALESCE(SUM(CASE WHEN biz_type='withdraw' AND status IN ('generated','printed') THEN amount ELSE 0 END), 0) as pending_withdraw
      FROM orders WHERE target_branch=?
    `).get(targetBranch);

    const netBalance = balStats.total_deposited - balStats.total_withdrawn;
    const available = netBalance - balStats.pending_withdraw;

    balanceInfo = {
      netBalance,
      totalDeposited: balStats.total_deposited,
      totalWithdrawn: balStats.total_withdrawn,
      pendingWithdraw: balStats.pending_withdraw,
      availableBalance: available,
      thisAmount: amount,
      afterWithdraw: available - amount
    };

    // 可用余额不足时警告（不阻止提交，由用户决定）
    if (available < amount) {
      await notifyGroup(`⚠️ 取款余额不足提醒
> 网点：${targetBranch}
> 可用余额：¥${available}
> 取款金额：¥${amount}
> 提交人：${submitterName}
> 注意：该网点可用余额不足以覆盖本次取款！`);
    }
  }

  const anomaly = detectAnomaly(submitterName);
  if (anomaly.anomaly) {
    await notifyGroup(`⚠️ 异常提交提醒
> 提交人：${submitterName}
> 异常类型：${anomaly.type}
> 详情：${JSON.stringify(anomaly)}
> 请财务关注！`);
  }

  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const prefix = bizType === 'withdraw' ? 'QK' : 'CK';
  const seq = db.prepare('SELECT COUNT(*) as cnt FROM orders WHERE order_no LIKE ?').get(`${prefix}${today}%`);
  const orderNo = `${prefix}${today}${String(seq.cnt + 1).padStart(4, '0')}`;

  const amountCn = amountToChinese(amount);
  const expireDays = parseInt(process.env.EXPIRE_DAYS || '3');
  const expireDate = new Date(Date.now() + expireDays * 86400000).toISOString().split('T')[0];
  const now = new Date().toISOString();

  const { qrContent, qrImage, sign } = await generateQR({
    biz_type: bizType, order_no: orderNo, amount,
    counterparty_name: counterpartyName, target_branch: targetBranch,
    expire_date: expireDate, created_at: now
  });

  const { hash, prevHash } = generateHash({
    order_no: orderNo, biz_type: bizType, submitter_id: submitterName,
    amount, counterparty_name: counterpartyName,
    target_branch: targetBranch, created_at: now
  });

  db.prepare(`INSERT INTO orders (
    order_no, biz_type, submitter_id, submitter_name, submitter_dept,
    submit_time, submit_ip, submit_device, amount, amount_cn,
    counterparty_name, counterparty_mobile, counterparty_account,
    target_branch, purpose, qr_data, qr_image, sign, expire_date,
    status, prev_hash, record_hash, remark, created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    orderNo, bizType, submitterName, submitterName, submitterDept,
    now, ip, deviceInfo, amount, amountCn,
    counterpartyName, counterpartyMobile, counterpartyAccount || null,
    targetBranch, purpose, qrContent, qrImage, sign, expireDate,
    'generated', prevHash, hash, remark, now
  );

  logAction({
    orderNo, action: 'submit',
    operatorId: submitterName, operatorName: submitterName,
    ip, device: deviceInfo, result: 'success',
    afterStatus: 'generated'
  });

  const typeLabel = bizType === 'withdraw' ? '取款' : '存款';
  await notifyGroup(`## 📋 新${typeLabel}单据已生成
> **单号：** ${orderNo}
> **金额：** ¥${amount}
> **提交人：** ${submitterName}
> **对方：** ${counterpartyName}
> **网点：** ${targetBranch}
> **有效期至：** ${expireDate}

单据已生成，可前往打印凭证`);

  res.json({
    success: true,
    orderNo,
    qrContent,
    qrImage,
    amountCn,
    expireDate,
    balance: balanceInfo,
    message: '单据已生成，可直接打印'
  });
});

router.get('/order/:orderNo', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE order_no=?').get(req.params.orderNo);
  if (!order) return res.json({ success: false, msg: '单据不存在' });
  res.json({ success: true, order });
});

router.get('/orders', (req, res) => {
  const { status, branch, date } = req.query;
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status=?'; params.push(status); }
  if (branch) { sql += ' AND (print_branch=? OR target_branch=?)'; params.push(branch, branch); }
  if (date) { sql += " AND date(submit_time)=date(?)"; params.push(date); }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  const orders = db.prepare(sql).all(...params);
  res.json({ success: true, orders });
});

module.exports = router;
