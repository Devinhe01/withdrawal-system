const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { verifyQR } = require('../services/qrcode');
const { logAction } = require('../services/security');
const { notifyGroup } = require('../services/notify');

router.post('/verify', async (req, res) => {
  const { qrContent, verifyUser, verifyUserName, deviceInfo } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  const { valid, data } = verifyQR(qrContent);
  if (!valid) {
    logAction({
      orderNo: data?.o || 'unknown', action: 'verify',
      operatorId: verifyUser, operatorName: verifyUserName,
      ip, device: deviceInfo, result: 'fail',
      failReason: '签名验证失败'
    });
    return res.json({ success: false, msg: '二维码无效或被篡改' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE order_no=?').get(data.o);
  if (!order) {
    logAction({ orderNo: data.o, action: 'verify', operatorId: verifyUser,
      operatorName: verifyUserName, ip, device: deviceInfo, result: 'fail',
      failReason: '单据不存在' });
    return res.json({ success: false, msg: '单据不存在' });
  }

  if (order.status !== 'printed') {
    const statusMap = {
      generated: '单据尚未打印，请先打印凭证',
      verified: '该单据已核销，不可重复使用',
      expired: '单据已过期',
      cancelled: '单据已作废'
    };
    logAction({ orderNo: data.o, action: 'verify', operatorId: verifyUser,
      operatorName: verifyUserName, ip, device: deviceInfo, result: 'fail',
      failReason: statusMap[order.status], beforeStatus: order.status });
    return res.json({ success: false, msg: statusMap[order.status] || '状态异常' });
  }

  const today = new Date().toISOString().split('T')[0];
  if (today > order.expire_date) {
    db.prepare("UPDATE orders SET status='expired' WHERE order_no=?").run(data.o);
    logAction({ orderNo: data.o, action: 'verify', operatorId: verifyUser,
      operatorName: verifyUserName, ip, device: deviceInfo, result: 'fail',
      failReason: '已过期', beforeStatus: 'printed', afterStatus: 'expired' });
    return res.json({ success: false, msg: '已超过有效期' });
  }

  const mobile = order.counterparty_mobile || '';
  const maskedMobile = mobile.length >= 7
    ? mobile.slice(0,3) + '****' + mobile.slice(-4)
    : mobile;

  res.json({
    success: true,
    bizType: data.t,
    bizTypeLabel: data.t === 'withdraw' ? '取款' : '存款',
    order: {
      orderNo: order.order_no,
      amount: order.amount,
      amountCn: order.amount_cn,
      counterpartyName: order.counterparty_name,
      counterpartyMobile: maskedMobile,
      counterpartyAccount: order.counterparty_account,
      purpose: order.purpose,
      targetBranch: order.target_branch,
      expireDate: order.expire_date,
      submitterName: order.submitter_name,
      submitTime: order.submit_time
    }
  });
});

router.post('/confirm', async (req, res) => {
  const { orderNo, verifyUser, verifyUserName, verifyBranch, deviceInfo } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  const order = db.prepare('SELECT * FROM orders WHERE order_no=?').get(orderNo);
  if (!order) return res.json({ success: false, msg: '单据不存在' });

  if (order.status !== 'printed') {
    logAction({ orderNo, action: 'verify', operatorId: verifyUserName,
      operatorName: verifyUserName, ip, device: deviceInfo, result: 'fail',
      failReason: `重复核销尝试，当前状态: ${order.status}`, beforeStatus: order.status });
    return res.json({ success: false, msg: '单据状态已变更，不可核销' });
  }

  const now = new Date().toISOString();
  const result = db.prepare(`UPDATE orders SET
    status='verified', verify_time=?, verify_user=?, verify_user_name=?,
    verify_branch=?, verify_device=?, verified_at=?
    WHERE order_no=? AND status='printed'`).run(
    now, verifyUserName, verifyUserName, verifyBranch, deviceInfo, now, orderNo
  );

  if (result.changes === 0) {
    return res.json({ success: false, msg: '核销失败，单据可能已被处理' });
  }

  logAction({
    orderNo, action: 'verify',
    operatorId: verifyUserName, operatorName: verifyUserName,
    ip, device: deviceInfo, result: 'success',
    beforeStatus: 'printed', afterStatus: 'verified'
  });

  const typeLabel = order.biz_type === 'withdraw' ? '取款' : '存款';
  await notifyGroup(`## ✅ ${typeLabel}已核销
> **单号：** ${orderNo}
> **金额：** ¥${order.amount}
> **核销人：** ${verifyUserName}
> **核销网点：** ${verifyBranch}
> **核销时间：** ${now}`);

  res.json({ success: true, msg: '核销成功' });
});

module.exports = router;
