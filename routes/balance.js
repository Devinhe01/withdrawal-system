const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { logAction } = require('../services/security');

router.get('/balance', (req, res) => {
  const { branch, startDate, endDate } = req.query;

  let branchFilter = '';
  const params = [];
  if (branch) {
    branchFilter = 'AND target_branch=?';
    params.push(branch);
  }

  let dateFilter = '';
  if (startDate) {
    dateFilter += " AND date(submit_time) >= date(?)";
    params.push(startDate);
  }
  if (endDate) {
    dateFilter += " AND date(submit_time) <= date(?)";
    params.push(endDate);
  }

  const allParams = branch ? [branch, ...params.slice(1)] : params;

  const stats = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN biz_type='deposit' AND status='verified' THEN amount ELSE 0 END), 0) as total_deposited,
      COALESCE(SUM(CASE WHEN biz_type='withdraw' AND status='verified' THEN amount ELSE 0 END), 0) as total_withdrawn,
      COALESCE(SUM(CASE WHEN biz_type='deposit' AND status IN ('verified') THEN amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN biz_type='withdraw' AND status IN ('verified') THEN amount ELSE 0 END), 0) as net_balance,
      COUNT(CASE WHEN biz_type='deposit' THEN 1 END) as deposit_count,
      COUNT(CASE WHEN biz_type='withdraw' THEN 1 END) as withdraw_count
    FROM orders WHERE 1=1 ${branchFilter} ${dateFilter}
  `).get(...allParams);

  const pending = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN biz_type='deposit' AND status IN ('generated','printed') THEN amount ELSE 0 END), 0) as pending_deposit,
      COALESCE(SUM(CASE WHEN biz_type='withdraw' AND status IN ('generated','printed') THEN amount ELSE 0 END), 0) as pending_withdraw
    FROM orders WHERE 1=1 ${branchFilter}
  `).get(...(branch ? [branch] : []));

  const recent = db.prepare(`
    SELECT order_no, biz_type, amount, counterparty_name, target_branch,
           status, submit_time, verify_time
    FROM orders WHERE 1=1 ${branchFilter}
    ORDER BY created_at DESC LIMIT 10
  `).all(...(branch ? [branch] : []));

  const available = stats.net_balance - pending.pending_withdraw;

  if (req.headers['x-user-id']) {
    logAction({
      orderNo: '-', action: 'query_balance',
      operatorId: req.headers['x-user-id'],
      operatorName: req.headers['x-user-name'] || '',
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      result: 'success'
    });
  }

  res.json({
    success: true,
    balance: {
      netBalance: stats.net_balance,
      totalDeposited: stats.total_deposited,
      totalWithdrawn: stats.total_withdrawn,
      pendingDeposit: pending.pending_deposit,
      pendingWithdraw: pending.pending_withdraw,
      availableBalance: available,
      depositCount: stats.deposit_count,
      withdrawCount: stats.withdraw_count
    },
    branch: branch || 'all',
    recent
  });
});

router.get('/balance/branch/:branchName', (req, res) => {
  const branch = req.params.branchName;

  const stats = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN biz_type='deposit' AND status='verified' THEN amount ELSE 0 END), 0) as total_deposited,
      COALESCE(SUM(CASE WHEN biz_type='withdraw' AND status='verified' THEN amount ELSE 0 END), 0) as total_withdrawn,
      COUNT(CASE WHEN biz_type='deposit' AND status='verified' THEN 1 END) as deposit_count,
      COUNT(CASE WHEN biz_type='withdraw' AND status='verified' THEN 1 END) as withdraw_count
    FROM orders WHERE target_branch=?
  `).get(branch);

  const pending = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN biz_type='withdraw' AND status IN ('generated','printed') THEN amount ELSE 0 END), 0) as pending_withdraw,
      COALESCE(SUM(CASE WHEN biz_type='deposit' AND status IN ('generated','printed') THEN amount ELSE 0 END), 0) as pending_deposit
    FROM orders WHERE target_branch=?
  `).get(branch);

  const netBalance = stats.total_deposited - stats.total_withdrawn;
  const available = netBalance - pending.pending_withdraw;

  res.json({
    success: true,
    branch,
    balance: {
      netBalance,
      totalDeposited: stats.total_deposited,
      totalWithdrawn: stats.total_withdrawn,
      pendingDeposit: pending.pending_deposit,
      pendingWithdraw: pending.pending_withdraw,
      availableBalance: available,
      depositCount: stats.deposit_count,
      withdrawCount: stats.withdraw_count
    }
  });
});

module.exports = router;
