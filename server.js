// ─────────────────────────────────────────────────────────────
// server.js — Lizzyland
// ─────────────────────────────────────────────────────────────

const express      = require('express');
const session      = require('express-session');
const path         = require('path');
const helmet       = require('helmet');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Security ─────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ─── View engine ──────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Static files ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Session ──────────────────────────────────────────────────
app.use(session({
  secret:            process.env.SESSION_SECRET || 'lizzyland-dev-secret',
  resave:            false,
  saveUninitialized: false,
  cookie:            { secure: process.env.NODE_ENV === 'production' }
}));

// ─── Simple analytics middleware ──────────────────────────────
// Records page views to memory (swap for DB later)
var analyticsLog = [];
app.use(function(req, res, next) {
  if (!req.path.startsWith('/admin') && !req.path.startsWith('/public')) {
    analyticsLog.push({
      page_path: req.path,
      created_at: new Date().toISOString(),
      ip: req.ip
    });
    // Keep only last 500 entries in memory
    if (analyticsLog.length > 500) analyticsLog = analyticsLog.slice(-500);
  }
  next();
});

// ─── Maintenance mode ─────────────────────────────────────────
var maintenanceMode = false;
app.use(function(req, res, next) {
  if (maintenanceMode && !req.path.startsWith('/admin') && req.path !== '/') {
    return res.status(503).send('<h1>🌴 Lizzyland is getting a little refresh — back soon!</h1>');
  }
  next();
});

// ─── Admin auth middleware ─────────────────────────────────────
function requireAdmin(req, res, next) {
  // For now: protect with a simple env-var password
  // In production: add proper login
  if (req.session && req.session.isAdmin) return next();
  // Allow access if ADMIN_PASS not set (dev mode)
  if (!process.env.ADMIN_PASS) return next();
  res.redirect('/admin/login');
}

// ─── PUBLIC ROUTES ────────────────────────────────────────────

app.get('/', function(req, res) {
  res.render('index', { user: req.session ? req.session.user : null });
});

app.get('/space', function(req, res) {
  res.render('space', { user: req.session ? req.session.user : null });
});

app.get('/health', function(req, res) {
  res.render('health', { user: req.session ? req.session.user : null });

  app.get('/about', (req, res) => res.render('about'));
  
});


// Shop
var shopRouter = require('./routes/shop');
app.use('/shop', shopRouter);

// Legal
app.get('/legal/terms', function(req, res) {
  res.send('<h1>Terms of Service</h1><p>Coming soon.</p><a href="/">← Home</a>');
});
app.get('/legal/privacy', function(req, res) {
  res.send('<h1>Privacy Policy</h1><p>Coming soon.</p><a href="/">← Home</a>');
});
app.get('/legal/shipping', function(req, res) {
  res.send('<h1>Shipping & Returns</h1><p>Coming soon.</p><a href="/">← Home</a>');
});

// ─── ADMIN ROUTES ─────────────────────────────────────────────

// Admin login (simple)
app.get('/admin/login', function(req, res) {
  res.send(`
    <style>body{font-family:sans-serif;background:#0d1a17;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
    .box{background:rgba(255,255,255,0.05);border:1px solid rgba(200,149,42,0.3);border-radius:12px;padding:2rem;width:320px;text-align:center;}
    h1{color:#c8952a;font-size:1.5rem;}input{width:100%;padding:0.75rem;margin:0.5rem 0;background:rgba(255,255,255,0.08);border:1px solid rgba(200,149,42,0.3);border-radius:8px;color:#fff;font-size:1rem;box-sizing:border-box;}
    button{width:100%;padding:0.75rem;background:#c8952a;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:1rem;cursor:pointer;margin-top:0.5rem;}</style>
    <div class="box">
      <h1>🌴 Lizzyland Admin</h1>
      <form method="POST" action="/admin/login">
        <input type="password" name="pass" placeholder="Admin password" autofocus>
        <button>Enter</button>
      </form>
    </div>
  `);
});

app.post('/admin/login', function(req, res) {
  var pass = process.env.ADMIN_PASS || 'lizzyland-admin';
  if (req.body.pass === pass) {
    req.session.isAdmin = true;
    res.redirect('/admin');
  } else {
    res.redirect('/admin/login');
  }
});

// Admin dashboard
app.get('/admin', requireAdmin, function(req, res) {
  var now  = new Date();
  var today = now.toISOString().split('T')[0];

  // Derive simple stats from in-memory log
  var todayViews    = analyticsLog.filter(function(e) { return e.created_at.startsWith(today); });
  var uniqueIpsToday = new Set(todayViews.map(function(e) { return e.ip; })).size;
  var weekAgo       = new Date(now - 7*24*60*60*1000).toISOString();
  var weekViews     = analyticsLog.filter(function(e) { return e.created_at > weekAgo; });
  var monthAgo      = new Date(now - 30*24*60*60*1000).toISOString();
  var monthViews    = analyticsLog.filter(function(e) { return e.created_at > monthAgo; });

  // Page popularity
  var pageCounts = {};
  analyticsLog.forEach(function(e) {
    pageCounts[e.page_path] = (pageCounts[e.page_path] || 0) + 1;
  });
  var popularPages = Object.keys(pageCounts).map(function(k) {
    return { page_path: k, views: pageCounts[k] };
  }).sort(function(a,b) { return b.views - a.views; }).slice(0, 10);

  // Build daily stats for chart (last 14 days)
  var dailyStats = [];
  for (var i = 13; i >= 0; i--) {
    var d = new Date(now - i*24*60*60*1000).toISOString().split('T')[0];
    dailyStats.push({
      date: d,
      page_views: analyticsLog.filter(function(e) { return e.created_at.startsWith(d); }).length
    });
  }

  res.render('admin', {
    user:            req.session.user || { username: 'Lizzy' },
    maintenanceOn:   maintenanceMode,
    manualProducts:  [],     // TODO: wire to DB
    orders:          [],     // TODO: wire to Stripe/DB
    customers:       [],     // TODO: wire to DB
    vouchers:        [],     // TODO: wire to DB
    subscriberCount: 0,      // TODO: wire to email provider
    orderStats:      { total: 0, revenue: 0, pending: 0, thisMonth: 0 },
    todayStats:      { todayVisitors: uniqueIpsToday, todayPageViews: todayViews.length },
    weeklyStats:     { weeklyVisitors: new Set(weekViews.map(function(e){return e.ip;})).size, weeklyPageViews: weekViews.length },
    monthlyStats:    { monthlyVisitors: new Set(monthViews.map(function(e){return e.ip;})).size, monthlyPageViews: monthViews.length },
    overallStats:    { totalUniqueVisitors: new Set(analyticsLog.map(function(e){return e.ip;})).size, totalPageViews: analyticsLog.length },
    popularPages:    popularPages,
    recentActivity:  analyticsLog.slice(-20).reverse(),
    dailyStats:      dailyStats
  });
});

// Toggle maintenance
app.post('/admin/toggle-maintenance', requireAdmin, function(req, res) {
  maintenanceMode = !maintenanceMode;
  res.json({ enabled: maintenanceMode });
});

// Products (manual) — placeholders for DB wiring
app.post('/admin/products', requireAdmin, function(req, res) {
  // TODO: save to database
  console.log('New product:', req.body);
  res.redirect('/admin');
});

app.delete('/admin/products/:id', requireAdmin, function(req, res) {
  // TODO: delete from database
  res.json({ success: true });
});

// Vouchers — placeholders
app.post('/admin/vouchers', requireAdmin, function(req, res) {
  // TODO: save to database
  console.log('New voucher:', req.body);
  res.redirect('/admin');
});

app.delete('/admin/vouchers/:id', requireAdmin, function(req, res) {
  res.json({ success: true });
});

// Users
app.post('/admin/users/:id/toggle-contributor', requireAdmin, function(req, res) {
  // TODO: wire to DB
  res.json({ success: true });
});

// ─── 404 ─────────────────────────────────────────────────────
app.use(function(req, res) {
  res.status(404).send('<h1 style="font-family:sans-serif;">404 — Lost in paradise 🌴</h1><a href="/">Go home</a>');
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, function() {
  console.log('🌴 Lizzyland running on port', PORT);
});

module.exports = app;
