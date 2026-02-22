// ─────────────────────────────────────────────────────────────
// server.js — Lizzyland
// ─────────────────────────────────────────────────────────────

const express      = require('express');
const session      = require('express-session');
const path         = require('path');
const helmet       = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security ─────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false // relax for CDN fonts/images
}));

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

// ─── Routes ───────────────────────────────────────────────────

// Landing page
app.get('/', function(req, res) {
  res.render('index', {
    user: req.session ? req.session.user : null
  });
});

// Shop — dynamic Printful fetch
const shopRouter = require('./routes/shop');
app.use('/shop', shopRouter);

// Your Internet Space — placeholder
app.get('/space', function(req, res) {
  res.render('index', { user: null }); // TODO: build space.ejs
});

// Legal placeholders
app.get('/legal/terms', function(req, res) {
  res.send('<h1>Terms of Service</h1><p>Coming soon.</p>');
});
app.get('/legal/privacy', function(req, res) {
  res.send('<h1>Privacy Policy</h1><p>Coming soon.</p>');
});

// 404
app.use(function(req, res) {
  res.status(404).send('<h1>404 — Lost in paradise 🌴</h1><a href="/">Go home</a>');
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, function() {
  console.log('🌴 Lizzyland running on port', PORT);
});

module.exports = app;
