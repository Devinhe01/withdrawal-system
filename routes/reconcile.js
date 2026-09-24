const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { verifyChain } = require('../services/security');

router.get('/reconcile/daily', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];

  const summary = db.prepare(`
    SELECT
      biz_type,
      COUNT(*) as count,
      SUM(amount) as total_amount,
      SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END) as verified_count,
      SUM(CASE WHEN status='generated' THEN 1 ELSE 0 END) as pending_count,
      SUM(CASE WHEN status='printed' THEN 1 ELSE 0 END) as printed_count,
      SUM(CASE WHEN status='expired' THEN 1 ELSE 0 END) as expired_count
    FROM orders WHERE date(submit_time)=date(?)
    GROUP BY biz_type
  `).all(date);

  const details = db.prepare(`
    SELECT order_no, biz_type, amount, submitter_name, counterparty_name,
           target_branch, status, submit_time, verify_time, verify_user_name
    FROM orders WHERE date(submit_time)=date(?)
    ORDER BY submit_time ASC
  `).all(date);

  const chainCheck = verifyChain();

  res.json({ date, summary, details, chainCheck });
});

router.get('/audit/:orderNo', (req, res) => {
  const logs = db.prepare(`
    SELECT * FROM audit_logs WHERE order_no=?
    ORDER BY created_at ASC
  `).all(req.params.orderNo);
  res.json({ orderNo: req.params.orderNo, logs });
});

module.exports = router;
