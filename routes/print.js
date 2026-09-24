const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { logAction } = require('../services/security');

router.get('/print/pending', (req, res) => {
  const branch = req.query.branch || 'headquarters';
  const orders = db.prepare(`
    SELECT * FROM orders
    WHERE status = 'generated'
      AND (print_branch = ? OR print_branch IS NULL)
    ORDER BY created_at ASC
    LIMIT 5
  `).all(branch);
  res.json({ orders });
});

router.post('/print/done', (req, res) => {
  const { orderNo, branch, printUser } = req.body;
  const now = new Date().toISOString();
  db.prepare(`UPDATE orders SET
    status='printed', print_time=?, print_branch=?,
    print_user=?, print_count=print_count+1
    WHERE order_no=?`).run(now, branch, printUser || 'system', orderNo);

  logAction({
    orderNo, action: 'print',
    operatorId: printUser, operatorName: printUser,
    result: 'success', afterStatus: 'printed'
  });

  res.json({ success: true });
});

router.post('/print/assign', (req, res) => {
  const { orderNo, branch } = req.body;
  db.prepare('UPDATE orders SET print_branch=? WHERE order_no=?').run(branch, orderNo);
  res.json({ success: true });
});

module.exports = router;
