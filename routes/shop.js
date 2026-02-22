// ─────────────────────────────────────────────────────────────
// routes/shop.js — Lizzyland Shop
// Dynamic Printful product fetch with 10-minute cache
// Store ID: 17754042
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const axios   = require('axios');

const PRINTFUL_API_KEY  = process.env.PRINTFUL_API_KEY;
const PRINTFUL_STORE_ID = '17754042';

// ─── Simple in-memory cache ───────────────────────────────────
let productCache = null;
let cacheTime    = 0;
const CACHE_TTL  = 10 * 60 * 1000; // 10 minutes

async function fetchPrintfulProducts() {
  const now = Date.now();
  if (productCache && (now - cacheTime) < CACHE_TTL) return productCache;

  if (!PRINTFUL_API_KEY) {
    console.error('Lizzyland: PRINTFUL_API_KEY is not set in Railway environment variables!');
    return [];
  }

  // Store ID header tells Printful which store to use when key has access to multiple
  const headers = {
    'Authorization': 'Bearer ' + PRINTFUL_API_KEY,
    'X-PF-Store-Id': PRINTFUL_STORE_ID
  };

  try {
    console.log('Lizzyland: Fetching products from Printful store', PRINTFUL_STORE_ID);

    const listResp = await axios.get('https://api.printful.com/store/products', {
      headers: headers,
      params:  { limit: 100 }
    });

    const list = (listResp.data && listResp.data.result) ? listResp.data.result : [];
    console.log('Lizzyland: Got', list.length, 'products from Printful');

    const detailed = await Promise.all(list.map(async function(p) {
      try {
        const detail = await axios.get('https://api.printful.com/store/products/' + p.id, {
          headers: headers
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
          category:      detectCategory(p.name)
        };
      } catch (e) {
        console.error('Lizzyland: Failed to fetch detail for product', p.id, e.message);
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
    if (err.response) {
      console.error('Lizzyland: Printful response status:', err.response.status);
      console.error('Lizzyland: Printful response body:', JSON.stringify(err.response.data));
    }
    return [];
  }
}

// ─── Category detection from product name ────────────────────
function detectCategory(name) {
  const n = (name || '').toLowerCase();
  if (/tee|t-shirt|shirt|tank|top/.test(n))                   return 'shirts';
  if (/hoodie|sweatshirt|sweater|pullover/.test(n))            return 'hoodies';
  if (/shoe|sneaker|slide|sandal|footwear/.test(n))            return 'footwear';
  if (/towel|beach towel/.test(n))                             return 'towels';
  if (/mug|cushion|pillow|decor|candle|print|poster/.test(n))  return 'homewares';
  if (/bag|hat|cap|beanie|accessory|accessories/.test(n))      return 'accessories';
  if (/christmas|xmas|festive|holiday|santa/.test(n))          return 'christmas';
  if (/colour|coloring|drawing|art guide/.test(n))             return 'colouring';
  if (/puzzle|proposal|novelty|funny/.test(n))                 return 'novelty';
  return 'other';
}

// ─── GET /shop ────────────────────────────────────────────────
router.get('/', async function(req, res) {
  try {
    const currentCat  = req.query.cat || 'all';
    const allProducts = await fetchPrintfulProducts();

    // Seasonal — never appear in main shop tabs
    const SEASONAL_CATS = ['christmas', 'colouring', 'novelty', 'seasonal', 'other'];

    let products;
    if (currentCat === 'all') {
      products = allProducts.filter(function(p) { return !SEASONAL_CATS.includes(p.category); });
    } else {
      products = allProducts.filter(function(p) { return p.category === currentCat; });
    }

    res.render('shop', {
      products:    products,
      currentCat:  currentCat,
      allProducts: allProducts,
      user:        (req.session && req.session.user) ? req.session.user : null
    });

  } catch (err) {
    console.error('Lizzyland: Shop route error:', err.message);
    res.status(500).render('shop', {
      products:    [],
      currentCat:  'all',
      allProducts: [],
      user:        null
    });
  }
});

module.exports = router;
