const crypto = require('crypto');
const db = require('../db/database');

function generateHash(record) {
  const last = db.prepare('SELECT record_hash FROM orders ORDER BY id DESC LIMIT 1').get();
  const prevHash = last ? last.record_hash : 'GENESIS';

  const content = JSON.stringify({
    order_no: record.order_no,
    biz_type: record.biz_type,
    submitter_id: record.submitter_id,
    amount: record.amount,
    counterparty_name: record.counterparty_name,
    target_branch: record.target_branch,
    created_at: record.created_at,
    prev_hash: prevHash
  });

  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return { hash, prevHash };
}

function verifyChain() {
  const records = db.prepare('SELECT * FROM orders ORDER BY id ASC').all();
  let prevHash = 'GENESIS';
  const broken = [];

  for (const r of records) {
    const content = JSON.stringify({
      order_no: r.order_no, biz_type: r.biz_type,
      submitter_id: r.submitter_id, amount: r.amount,
      counterparty_name: r.counterparty_name, target_branch: r.target_branch,
      created_at: r.created_at || r.submit_time, prev_hash: prevHash
    });
    const expected = crypto.createHash('sha256').update(content).digest('hex');

    if (expected !== r.record_hash) {
      broken.push({ order_no: r.order_no, id: r.id });
    }
    prevHash = r.record_hash;
  }

  return { total: records.length, broken: broken.length, brokenList: broken };
}

function logAction(data) {
  db.prepare(`INSERT INTO audit_logs
    (order_no, action, operator_id, operator_name, ip, device,
     result, fail_reason, before_status, after_status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`).run(
    data.orderNo, data.action, data.operatorId, data.operatorName,
    data.ip || null, data.device || null, data.result,
    data.failReason || null, data.beforeStatus || null, data.afterStatus || null
  );
}

function detectAnomaly(submitterName) {
  const now = new Date();
  const oneHourAgo = new Date(now - 3600000).toISOString();

  const recent = db.prepare(
    `SELECT COUNT(*) as cnt FROM orders WHERE submitter_name=? AND created_at > ?`
  ).get(submitterName, oneHourAgo);

  if (recent.cnt >= 5) {
    return { anomaly: true, type: '高频提交', count: recent.cnt };
  }

  const AMOUNT_THRESHOLD = 100000;
  const latest = db.prepare(
    'SELECT amount FROM orders WHERE submitter_name=? ORDER BY id DESC LIMIT 1'
  ).get(submitterName);

  if (latest && latest.amount > AMOUNT_THRESHOLD) {
    return { anomaly: true, type: '大额提交', amount: latest.amount };
  }

  return { anomaly: false };
}

module.exports = { generateHash, verifyChain, logAction, detectAnomaly };
