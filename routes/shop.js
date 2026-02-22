// ─────────────────────────────────────────────────────────────
// routes/shop.js — Lizzyland Shop
// Dynamic Printful product fetch with 10-minute cache
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const axios   = require('axios');

const PRINTFUL_API_KEY = process.env.PRINTFUL_API_KEY;

// ─── Simple in-memory cache ───────────────────────────────────
let productCache = null;
let cacheTime    = 0;
const CACHE_TTL  = 10 * 60 * 1000; // 10 minutes

async function fetchPrintfulProducts() {
  const now = Date.now();
  if (productCache && (now - cacheTime) < CACHE_TTL) return productCache;

  try {
    const listResp = await axios.get('https://api.printful.com/store/products', {
      headers: { 'Authorization': 'Bearer ' + PRINTFUL_API_KEY },
      params: { limit: 100 }
    });

    const list = (listResp.data && listResp.data.result) ? listResp.data.result : [];

    const detailed = await Promise.all(list.map(async function(p) {
      try {
        const detail = await axios.get('https://api.printful.com/store/products/' + p.id, {
          headers: { 'Authorization': 'Bearer ' + PRINTFUL_API_KEY }
        });
        const variants = (detail.data.result && detail.data.result.sync_variants) || [];
        let minPrice = null;
        variants.forEach(function(v) {
          const price = parseFloat(v.retail_price);
          if (!isNaN(price) && (minPrice === null || price < minPrice)) minPrice = price;
        });
        return {
          id:            p.id,
          name:          p.name,
          thumbnail_url: p.thumbnail_url || null,
          variant_count: p.synced || 0,
          price:         minPrice,
          // Lizzyland uses tags in Printful product names or descriptions
          // to categorise into: shirts, hoodies, footwear, towels, homewares,
          // accessories, christmas, colouring, novelty, seasonal
          category:      detectCategory(p.name)
        };
      } catch (e) {
        return {
          id:            p.id,
          name:          p.name,
          thumbnail_url: p.thumbnail_url || null,
          variant_count: p.synced || 0,
          price:         null,
          category:      detectCategory(p.name)
        };
      }
    }));

    productCache = detailed;
    cacheTime    = now;
    console.log('Lizzyland: Printful products cached:', detailed.length, 'items');
    return detailed;

  } catch (err) {
    console.error('Lizzyland: Printful fetch failed:', err.message);
    return [];
  }
}

// ─── Category detection from product name ────────────────────
// Printful doesn't have categories — we infer from product name keywords.
// As Lizzy adds products, she can follow naming conventions like:
//   "Tropical Sunset Tee" → shirts
//   "Beach Hoodie — Palm Print" → hoodies
// OR: we can use Printful Tags field in the future.
function detectCategory(name) {
  const n = (name || '').toLowerCase();
  if (/tee|t-shirt|shirt|tank|top/.test(n))            return 'shirts';
  if (/hoodie|sweatshirt|sweater|pullover/.test(n))     return 'hoodies';
  if (/shoe|sneaker|slide|sandal|footwear/.test(n))     return 'footwear';
  if (/towel|beach towel/.test(n))                      return 'towels';
  if (/mug|cushion|pillow|decor|candle|print|poster/.test(n)) return 'homewares';
  if (/bag|hat|cap|beanie|accessory|accessories/.test(n)) return 'accessories';
  if (/christmas|xmas|festive|holiday|santa/.test(n))   return 'christmas';
  if (/colour|coloring|drawing|art guide/.test(n))      return 'colouring';
  if (/puzzle|proposal|novelty|funny/.test(n))          return 'novelty';
  return 'other'; // everything else goes to the seasonal/misc bucket
}

// ─── GET /shop ────────────────────────────────────────────────
router.get('/', async function(req, res) {
  const currentCat = req.query.cat || 'all';
  const allProducts = await fetchPrintfulProducts();

  // Seasonal/special categories — never appear in main shop
  const SEASONAL_CATS = ['christmas', 'colouring', 'novelty', 'seasonal', 'other'];

  // Filter for main shop (exclude seasonal)
  let products;
  if (currentCat === 'all') {
    products = allProducts.filter(p => !SEASONAL_CATS.includes(p.category));
  } else if (SEASONAL_CATS.includes(currentCat)) {
    products = allProducts.filter(p => p.category === currentCat);
  } else {
    products = allProducts.filter(p => p.category === currentCat);
  }

  res.render('lizzyland-shop', {
    products:    products,
    currentCat:  currentCat,
    allProducts: allProducts,
    user:        req.session ? req.session.user : null
  });
});

module.exports = router;
