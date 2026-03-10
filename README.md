# 🌴 Lizzyland

La Dolce Vita

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your actual values
npm start
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `SESSION_SECRET` | Secret for express-session |
| `PRINTFUL_API_KEY` | Your Printful Bearer token |
| `NODE_ENV` | `development` or `production` |

## Structure

```
lizzyland/
├── server.js              # Express app entry point
├── routes/
│   └── shop.js            # Printful shop + category logic
├── views/
│   ├── index.ejs          # Landing page (hero + doors + about)
│   └── shop.ejs           # Shop (categories + Printful products)
├── public/
│   ├── css/lizzyland.css  # Full tropical Art Nouveau theme
│   └── images/            # Brand assets
└── package.json
```

## Railway Deployment

1. Push to GitHub
2. Create new Railway project → Deploy from GitHub
3. Set environment variables in Railway dashboard
4. Add custom domain: lizzyland.xyz

## Images Still Needed

- `beach-banner.jpg` — Blue tropical beach (landing hero)
- `shop-banner.jpg` — Pink sunset beach (shop hero)  
- `door-space.jpg` — Pale carved wood doors (Your Internet Space card)
- `door-shop.jpg` — Blue peeling paint ornate doors (The Shop card)

Drop these into `public/images/` and they'll load automatically.
