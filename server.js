// ─────────────────────────────────────────────────────────────
// server.js — Lizzyland
// ─────────────────────────────────────────────────────────────
const express      = require('express');
const session      = require('express-session');
const cookieParser = require('cookie-parser');
const path         = require('path');
const helmet       = require('helmet');
const crypto       = require('crypto');
const multer       = require('multer');
const fs           = require('fs');

const db  = require('./database');
const app = express();
const PORT = process.env.PORT || 3000;

// ─── Multer (photo uploads) ────────────────────────────────
var uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

var storage = multer.diskStorage({
  destination: function(req, file, cb) { cb(null, uploadDir); },
  filename: function(req, file, cb) {
    var ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + '-' + Math.round(Math.random()*1e6) + ext);
  }
});
var upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Security ─────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ─── View engine ──────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Static + body ────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Session ──────────────────────────────────────────────
app.use(session({
  secret:            process.env.SESSION_SECRET || 'll-dev-secret-change-in-prod',
  resave:            false,
  saveUninitialized: false,
  cookie:            { secure: process.env.NODE_ENV === 'production', maxAge: 24*60*60*1000 }
}));

// ─── Remember-me middleware ────────────────────────────────
app.use(function(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  var token = req.cookies && req.cookies.ll_remember;
  if (!token) return next();
  db.get(
    'SELECT * FROM auth_tokens WHERE token = ? AND expires_at > datetime("now")',
    [token],
    function(err, row) {
      if (!err && row) {
        req.session.isAdmin = true;
        req.session.userId  = row.user_id;
      }
      next();
    }
  );
});

// ─── Analytics middleware ─────────────────────────────────
// Assign a visitor cookie if none exists, then log to DB
app.use(function(req, res, next) {
  if (req.path.startsWith('/admin') ||
      req.path.startsWith('/public') ||
      req.path.match(/\.(css|js|png|jpg|ico|svg|woff|woff2)$/)) {
    return next();
  }
  var visitorId = req.cookies && req.cookies.ll_vid;
  if (!visitorId) {
    visitorId = crypto.randomBytes(12).toString('hex');
    res.cookie('ll_vid', visitorId, { maxAge: 365*24*60*60*1000, httpOnly: true });
  }
  var referrer = req.get('Referrer') || req.get('Referer') || '';
  db.run(
    'INSERT INTO analytics (visitor_id, page_path, referrer, user_agent, ip_address) VALUES (?,?,?,?,?)',
    [visitorId, req.path, referrer, (req.get('User-Agent') || '').substring(0, 200), req.ip]
  );
  next();
});

// ─── Maintenance mode ─────────────────────────────────────
var maintenanceMode = false;
app.use(function(req, res, next) {
  if (maintenanceMode && !req.path.startsWith('/admin') && req.path !== '/') {
    return res.status(503).send('<h1 style="font-family:sans-serif;text-align:center;padding:4rem;">🌴 Lizzyland is getting a little refresh — back soon!</h1>');
  }
  next();
});

// ─── Admin auth middleware ────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  if (!process.env.ADMIN_PASS) return next(); // dev mode
  res.redirect('/admin/login');
}

// ─── Slug helper ──────────────────────────────────────────
function makeSlug(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ─── Analytics helpers ────────────────────────────────────
function queryAsync(sql, params) {
  return new Promise(function(resolve, reject) {
    db.all(sql, params || [], function(err, rows) {
      if (err) reject(err); else resolve(rows || []);
    });
  });
}
function getAsync(sql, params) {
  return new Promise(function(resolve, reject) {
    db.get(sql, params || [], function(err, row) {
      if (err) reject(err); else resolve(row || null);
    });
  });
}

// ─────────────────────────────────────────────────────────
// PUBLIC ROUTES
// ─────────────────────────────────────────────────────────

app.get('/', function(req, res) {
  // Fetch latest 3 published blog posts for homepage
  db.all(
    'SELECT id, title, slug, category, image_url, created_at FROM blog_posts WHERE status = "published" ORDER BY created_at DESC LIMIT 3',
    [],
    function(err, posts) {
      res.render('index', { user: req.session && req.session.user ? req.session.user : null, latestPosts: posts || [] });
    }
  );
});

app.get('/health', function(req, res) {
  res.render('health', { user: req.session && req.session.user ? req.session.user : null });
});

app.get('/space', function(req, res) {
  res.render('space', { user: req.session && req.session.user ? req.session.user : null });
});

app.get('/about', function(req, res) {
  res.render('about', { user: req.session && req.session.user ? req.session.user : null });
});

app.get('/shop', function(req, res) {
  var brand = req.query.brand || 'all';
  var query = brand === 'all'
    ? 'SELECT * FROM products WHERE status = "published" ORDER BY created_at DESC'
    : 'SELECT * FROM products WHERE status = "published" AND brand = ? ORDER BY created_at DESC';
  var params = brand === 'all' ? [] : [brand];
  db.all(query, params, function(err, products) {
    res.render('shop', {
      products:   products || [],
      currentBrand: brand,
      user: req.session && req.session.user ? req.session.user : null
    });
  });
});

// Blog public routes
app.get('/blog', function(req, res) {
  db.all(
    'SELECT id, title, slug, category, image_url, body, created_at FROM blog_posts WHERE status = "published" ORDER BY created_at DESC LIMIT 20',
    [],
    function(err, posts) {
      res.render('blog', { posts: posts || [], user: null });
    }
  );
});

app.get('/blog/:slug', function(req, res) {
  db.get(
    'SELECT * FROM blog_posts WHERE slug = ? AND status = "published"',
    [req.params.slug],
    function(err, post) {
      if (!post) return res.status(404).send('<h1>Post not found 🌴</h1><a href="/blog">← Blog</a>');
      res.render('blog-post', { post: post, user: null });
    }
  );
});

// Affiliate click tracking redirect
app.get('/go/:linkName', function(req, res) {
  var linkName = req.params.linkName;
  // Map of affiliate link names to destinations + doors
  var links = {
    'sauna':      { dest: process.env.AFF_SAUNA     || '#', door: 'health' },
    'chair':      { dest: process.env.AFF_CHAIR     || '#', door: 'health' },
    'vibration':  { dest: process.env.AFF_VIBRATION || '#', door: 'health' },
    'tub':        { dest: process.env.AFF_TUB       || '#', door: 'health' },
    'promeed':    { dest: process.env.AFF_PROMEED    || '#', door: 'health' },
    'saatva':     { dest: process.env.AFF_SAATVA     || '#', door: 'health' }
  };
  var link = links[linkName];
  if (!link) return res.redirect('/');
  db.run(
    'INSERT INTO affiliate_clicks (link_name, door, destination, ip_address, referrer) VALUES (?,?,?,?,?)',
    [linkName, link.door, link.dest, req.ip, req.get('Referrer') || '']
  );
  res.redirect(link.dest);
});

// Legal
app.get('/legal/terms',    function(req, res) { res.send('<h1>Terms of Service</h1><p>Coming soon.</p><a href="/">← Home</a>'); });
app.get('/legal/privacy',  function(req, res) { res.send('<h1>Privacy Policy</h1><p>Coming soon.</p><a href="/">← Home</a>'); });
app.get('/legal/shipping', function(req, res) { res.send('<h1>Shipping & Returns</h1><p>Coming soon.</p><a href="/">← Home</a>'); });

// Newsletter subscribe
app.post('/subscribe', function(req, res) {
  var email = (req.body.email || '').trim().toLowerCase();
  var name  = (req.body.name  || '').trim();
  if (!email) return res.json({ ok: false, message: 'Email required' });
  db.run('INSERT OR IGNORE INTO subscribers (email, name) VALUES (?,?)', [email, name], function(err) {
    if (err) return res.json({ ok: false, message: 'Could not subscribe' });
    res.json({ ok: true, message: 'Subscribed! Welcome to Lizzyland 🌴' });
  });
});

// ─────────────────────────────────────────────────────────
// ADMIN ROUTES
// ─────────────────────────────────────────────────────────

// Login page
app.get('/admin/login', function(req, res) {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Lizzyland Admin</title>
  <link href="https://fonts.googleapis.com/css2?family=Oleo+Script:wght@400;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', sans-serif; background: #0a1a15; color: #fff;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1rem; }
    .box { background: rgba(255,255,255,0.04); border: 1px solid rgba(200,149,42,0.3);
           border-radius: 16px; padding: 2.5rem 2rem; width: 100%; max-width: 360px; text-align: center; }
    .logo { font-family: 'Oleo Script', cursive; font-size: 2rem; color: #c8952a; margin-bottom: 0.25rem; }
    .sub  { font-size: 0.85rem; color: rgba(255,255,255,0.4); margin-bottom: 2rem; }
    .err  { background: rgba(220,60,60,0.15); border: 1px solid rgba(220,60,60,0.4);
            border-radius: 8px; padding: 0.6rem; font-size: 0.85rem; color: #ff8080; margin-bottom: 1rem; }
    input { width: 100%; padding: 0.75rem 1rem; margin-bottom: 0.75rem;
            background: rgba(255,255,255,0.07); border: 1px solid rgba(200,149,42,0.3);
            border-radius: 8px; color: #fff; font-size: 0.95rem; font-family: inherit; }
    input:focus { outline: none; border-color: #c8952a; }
    .remember { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;
                font-size: 0.85rem; color: rgba(255,255,255,0.5); cursor: pointer; }
    .remember input[type=checkbox] { width: auto; margin: 0; accent-color: #c8952a; }
    button { width: 100%; padding: 0.8rem; background: #c8952a; color: #fff; border: none;
             border-radius: 8px; font-weight: 700; font-size: 1rem; cursor: pointer; transition: opacity 0.2s; }
    button:hover { opacity: 0.85; }
  </style>
</head>
<body>
  <div class="box">
    <div class="logo">🌴 Lizzyland</div>
    <div class="sub">Admin dashboard</div>
    ${req.query.err ? '<div class="err">Wrong password — try again</div>' : ''}
    <form method="POST" action="/admin/login">
      <input type="password" name="pass" placeholder="Admin password" autofocus>
      <label class="remember">
        <input type="checkbox" name="remember" value="1"> Remember me for 30 days
      </label>
      <button type="submit">Enter</button>
    </form>
  </div>
</body>
</html>`);
});

// Login POST
app.post('/admin/login', function(req, res) {
  var pass = process.env.ADMIN_PASS || 'lizzyland-admin';
  if (req.body.pass !== pass) return res.redirect('/admin/login?err=1');

  req.session.isAdmin = true;

  if (req.body.remember === '1') {
    var token = crypto.randomBytes(32).toString('hex');
    var expires = new Date(Date.now() + 30*24*60*60*1000).toISOString();
    db.run(
      'INSERT INTO auth_tokens (user_id, token, expires_at) VALUES (1, ?, ?)',
      [token, expires],
      function(err) {
        if (!err) {
          res.cookie('ll_remember', token, {
            maxAge: 30*24*60*60*1000,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
          });
        }
        res.redirect('/admin');
      }
    );
  } else {
    res.redirect('/admin');
  }
});

// Logout
app.get('/admin/logout', function(req, res) {
  var token = req.cookies && req.cookies.ll_remember;
  if (token) db.run('DELETE FROM auth_tokens WHERE token = ?', [token]);
  res.clearCookie('ll_remember');
  req.session.destroy(function() { res.redirect('/'); });
});

// ── Admin dashboard ────────────────────────────────────────
app.get('/admin', requireAdmin, async function(req, res) {
  try {
    var now   = new Date();
    var today = now.toISOString().split('T')[0];

    // Today
    var todayRows = await queryAsync(
      'SELECT COUNT(*) as views, COUNT(DISTINCT visitor_id) as visitors FROM analytics WHERE date(created_at) = ?',
      [today]
    );
    var todayData = todayRows[0] || { views: 0, visitors: 0 };

    // 7-day sparkline + weekly total
    var sparkline = [];
    var weekVisitors = new Set();
    for (var i = 6; i >= 0; i--) {
      var d = new Date(now - i*24*60*60*1000);
      var ds = d.toISOString().split('T')[0];
      var dayLabel = d.toLocaleDateString('en-GB', { weekday: 'short' });
      var dayRows = await queryAsync(
        'SELECT COUNT(*) as views, COUNT(DISTINCT visitor_id) as visitors FROM analytics WHERE date(created_at) = ?',
        [ds]
      );
      var dayData = dayRows[0] || { views: 0, visitors: 0 };
      sparkline.push({ date: ds, label: dayLabel, views: dayData.views || 0, visitors: dayData.visitors || 0 });
    }
    var weeklyTotal = sparkline.reduce(function(sum, d) { return sum + d.visitors; }, 0);

    // Monthly
    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    var monthRows = await queryAsync(
      'SELECT COUNT(DISTINCT visitor_id) as visitors FROM analytics WHERE date(created_at) >= ?',
      [monthStart]
    );
    var monthlyVisitors = (monthRows[0] || { visitors: 0 }).visitors;

    // Top pages this week
    var weekAgo = new Date(now - 7*24*60*60*1000).toISOString();
    var popularPages = await queryAsync(
      'SELECT page_path, COUNT(*) as views FROM analytics WHERE created_at > ? GROUP BY page_path ORDER BY views DESC LIMIT 8',
      [weekAgo]
    );

    // Referrers
    var referrers = await queryAsync(
      'SELECT referrer, COUNT(*) as visits FROM analytics WHERE created_at > ? AND referrer != "" GROUP BY referrer ORDER BY visits DESC LIMIT 10',
      [weekAgo]
    );
    // Simplify referrer to domain
    referrers = referrers.map(function(r) {
      var domain = r.referrer;
      try { domain = new URL(r.referrer).hostname.replace('www.', ''); } catch(e) {}
      return { domain: domain, visits: r.visits };
    });

    // Affiliate clicks
    var affClicks = await queryAsync(
      'SELECT link_name, door, COUNT(*) as clicks FROM affiliate_clicks WHERE created_at > ? GROUP BY link_name ORDER BY clicks DESC',
      [weekAgo]
    );

    // Recent activity
    var recentActivity = await queryAsync(
      'SELECT page_path, referrer, created_at FROM analytics ORDER BY created_at DESC LIMIT 20'
    );

    // Products
    var manualProducts = await queryAsync('SELECT * FROM products ORDER BY created_at DESC');

    // Orders
    var orders = await queryAsync('SELECT * FROM orders ORDER BY created_at DESC LIMIT 50');
    var orderStats = await getAsync('SELECT COUNT(*) as total, SUM(amount) as revenue, SUM(CASE WHEN status="pending" THEN 1 ELSE 0 END) as pending FROM orders');

    // Customers
    var customers = await queryAsync('SELECT * FROM subscribers ORDER BY created_at DESC');

    // Vouchers
    var vouchers = await queryAsync('SELECT * FROM vouchers ORDER BY created_at DESC');

    // Blog posts
    var blogPosts = await queryAsync('SELECT * FROM blog_posts ORDER BY created_at DESC LIMIT 50');

    // Subscriber count
    var subCount = await getAsync('SELECT COUNT(*) as cnt FROM subscribers WHERE active = 1');

    res.render('admin', {
      user:            { username: 'Lizzy' },
      maintenanceOn:   maintenanceMode,
      manualProducts:  manualProducts,
      orders:          orders,
      orderStats:      { total: (orderStats && orderStats.total) || 0, revenue: (orderStats && orderStats.revenue) || 0, pending: (orderStats && orderStats.pending) || 0, thisMonth: 0 },
      customers:       customers,
      vouchers:        vouchers,
      blogPosts:       blogPosts,
      subscriberCount: (subCount && subCount.cnt) || 0,
      todayStats:      { todayVisitors: todayData.visitors || 0, todayPageViews: todayData.views || 0 },
      weeklyStats:     { weeklyVisitors: weeklyTotal, weeklyPageViews: sparkline.reduce(function(s,d){return s+d.views;},0) },
      monthlyStats:    { monthlyVisitors: monthlyVisitors },
      sparkline:       sparkline,
      popularPages:    popularPages,
      referrers:       referrers,
      affClicks:       affClicks,
      recentActivity:  recentActivity
    });
  } catch(err) {
    console.error('Admin route error:', err);
    res.status(500).send('Admin error: ' + err.message);
  }
});

// Toggle maintenance
app.post('/admin/toggle-maintenance', requireAdmin, function(req, res) {
  maintenanceMode = !maintenanceMode;
  res.json({ enabled: maintenanceMode });
});

// ── Products ───────────────────────────────────────────────
app.post('/admin/products', requireAdmin, upload.single('image'), function(req, res) {
  var slug = makeSlug(req.body.slug || req.body.name);
  var imgUrl = req.file ? '/uploads/' + req.file.filename : null;
  db.run(
    'INSERT INTO products (name,slug,description,price,image_url,category,supplier,brand,status,buy_url) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [req.body.name, slug, req.body.description, req.body.price, imgUrl,
     req.body.category || 'other', req.body.supplier || 'manual', req.body.brand || 'lizzyland',
     req.body.status || 'draft', req.body.buy_url],
    function(err) {
      if (err) console.error('Product insert error:', err.message);
      res.redirect('/admin');
    }
  );
});

app.delete('/admin/products/:id', requireAdmin, function(req, res) {
  db.run('DELETE FROM products WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.json({ ok: false });
    res.json({ ok: true });
  });
});

// ── Blog ───────────────────────────────────────────────────
app.post('/admin/blog', requireAdmin, upload.single('image'), function(req, res) {
  var slug = makeSlug(req.body.slug || req.body.title) + '-' + Date.now();
  var imgUrl = req.file ? '/uploads/' + req.file.filename : (req.body.image_url || null);
  var scheduledAt = req.body.scheduled_at || null;
  var status = req.body.status || 'draft';
  if (scheduledAt && status !== 'published') status = 'scheduled';

  db.run(
    'INSERT INTO blog_posts (title,slug,body,category,status,image_url,source,scheduled_at) VALUES (?,?,?,?,?,?,?,?)',
    [req.body.title, slug, req.body.body, req.body.category || 'general',
     status, imgUrl, 'admin', scheduledAt],
    function(err) {
      if (err) console.error('Blog insert error:', err.message);
      res.redirect('/admin#blog');
    }
  );
});

app.delete('/admin/blog/:id', requireAdmin, function(req, res) {
  db.run('DELETE FROM blog_posts WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.json({ ok: false });
    res.json({ ok: true });
  });
});

// ── Vouchers ───────────────────────────────────────────────
app.post('/admin/vouchers', requireAdmin, function(req, res) {
  db.run(
    'INSERT INTO vouchers (code, type, value, max_uses, expires_at) VALUES (?,?,?,?,?)',
    [(req.body.code || '').toUpperCase(), req.body.type || 'percent',
     req.body.value, req.body.max_uses || null, req.body.expires_at || null],
    function(err) {
      if (err) console.error('Voucher insert error:', err.message);
      res.redirect('/admin');
    }
  );
});

app.delete('/admin/vouchers/:id', requireAdmin, function(req, res) {
  db.run('DELETE FROM vouchers WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.json({ ok: false });
    res.json({ ok: true });
  });
});

// ── Scheduled post publisher (runs every 5 min) ────────────
setInterval(function() {
  db.run(
    'UPDATE blog_posts SET status = "published" WHERE status = "scheduled" AND scheduled_at <= datetime("now")'
  );
}, 5 * 60 * 1000);

// ─── 404 ──────────────────────────────────────────────────
app.use(function(req, res) {
  res.status(404).send('<h1 style="font-family:sans-serif;text-align:center;padding:4rem;">404 — Lost in paradise 🌴</h1><a href="/">← Go home</a>');
});

// ─── Start ────────────────────────────────────────────────
app.listen(PORT, function() {
  console.log('🌴 Lizzyland running on port', PORT);
});

module.exports = app;
