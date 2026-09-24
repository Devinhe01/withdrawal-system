const Database = require('better-sqlite3');
const db = new Database('./withdrawal.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT UNIQUE NOT NULL,
    biz_type TEXT NOT NULL,
    submitter_id TEXT NOT NULL,
    submitter_name TEXT,
    submitter_dept TEXT,
    submit_time TEXT NOT NULL,
    submit_ip TEXT,
    submit_device TEXT,
    amount REAL NOT NULL,
    amount_cn TEXT,
    counterparty_name TEXT NOT NULL,
    counterparty_mobile TEXT,
    counterparty_account TEXT,
    target_branch TEXT NOT NULL,
    purpose TEXT,
    qr_data TEXT,
    qr_image TEXT,
    sign TEXT,
    expire_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'generated',
    print_time TEXT,
    print_user TEXT,
    print_branch TEXT,
    print_count INTEGER DEFAULT 0,
    verify_time TEXT,
    verify_user TEXT,
    verify_user_name TEXT,
    verify_branch TEXT,
    verify_device TEXT,
    remark TEXT,
    prev_hash TEXT,
    record_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    verified_at TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT NOT NULL,
    action TEXT NOT NULL,
    operator_id TEXT,
    operator_name TEXT,
    ip TEXT,
    device TEXT,
    result TEXT NOT NULL,
    fail_reason TEXT,
    before_status TEXT,
    after_status TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_branch ON orders(print_branch);
  CREATE INDEX IF NOT EXISTS idx_orders_no ON orders(order_no);
  CREATE INDEX IF NOT EXISTS idx_logs_order ON audit_logs(order_no);
`);

module.exports = db;
