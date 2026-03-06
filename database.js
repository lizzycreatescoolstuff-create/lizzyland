// ─────────────────────────────────────────────────────────────
// database.js — Lizzyland
// ─────────────────────────────────────────────────────────────
const sqlite3 = require('sqlite3').verbose();

const dbPath = process.env.NODE_ENV === 'production'
  ? '/app/data/lizzyland.db'
  : './lizzyland.db';

const db = new sqlite3.Database(dbPath, function(err) {
  if (err) { console.error('DB open failed:', err.message); process.exit(1); }
  console.log('Connected to DB:', dbPath);
});

db.serialize(function() {
  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA foreign_keys=ON');

  // Users
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password TEXT,
    display_name TEXT,
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Auth tokens (remember me)
  db.run(`CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // Blog posts
  db.run(`CREATE TABLE IF NOT EXISTS blog_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE,
    body TEXT,
    category TEXT DEFAULT 'general',
    status TEXT DEFAULT 'draft',
    image_url TEXT,
    source TEXT DEFAULT 'admin',
    scheduled_at DATETIME,
    newsletter_sent INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Products (manual / Contrado)
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    description TEXT,
    price REAL,
    image_url TEXT,
    category TEXT DEFAULT 'other',
    supplier TEXT DEFAULT 'manual',
    brand TEXT DEFAULT 'lizzyland',
    status TEXT DEFAULT 'draft',
    buy_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Orders
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT,
    customer_email TEXT,
    product_name TEXT,
    amount REAL,
    status TEXT DEFAULT 'pending',
    payment_ref TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Vouchers
  db.run(`CREATE TABLE IF NOT EXISTS vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    type TEXT DEFAULT 'percent',
    value REAL NOT NULL,
    max_uses INTEGER,
    used_count INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Analytics
  db.run(`CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id TEXT,
    page_path TEXT,
    referrer TEXT,
    user_agent TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Affiliate clicks
  db.run(`CREATE TABLE IF NOT EXISTS affiliate_clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_name TEXT,
    door TEXT,
    destination TEXT,
    ip_address TEXT,
    referrer TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Newsletter subscribers
  db.run(`CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Seed admin
  db.get('SELECT COUNT(*) as cnt FROM users', function(err, row) {
    if (!err && row && row.cnt === 0) {
      try {
        var bcrypt = require('bcrypt');
        var hash = bcrypt.hashSync(process.env.ADMIN_PASS || 'lizzyland-admin', 10);
        db.run('INSERT INTO users (username,email,password,display_name,is_admin) VALUES (?,?,?,?,1)',
          ['lizzy','hello@lizzyland.xyz', hash, 'Lizzy']);
        console.log('Admin user seeded');
      } catch(e) { console.error('Seed error:', e.message); }
    }
  });

  console.log('Lizzyland DB ready');
});

module.exports = db;
