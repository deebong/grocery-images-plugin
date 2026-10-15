/**
 * js/providers/open-food-facts.js
 * Open Food Facts API Adapter
 * Complies with User-Agent policies, rate limits (1 req/sec recommended),
 * barcode lookup endpoint, and search query params.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../catalog-core'), require('../storage'));
  } else {
    root.OpenFoodFactsProvider = factory(root.CatalogCore, root.CatalogStorage);
  }
}(typeof self !== 'undefined' ? self : this, function (CatalogCore, CatalogStorage) {
  'use strict';

  const DEFAULT_USER_AGENT = 'RetailPOSGroceryPicker/1.0 (retailpos-plugin@example.org)';
  const BASE_URL = 'https://world.openfoodfacts.org';
  const SEARCH_FIELDS = 'code,product_name,brands,categories,quantity,image_front_url,image_front_small_url,image_back_url,image_nutrition_url,image_ingredients_url,images';

  let config = {
    userAgent: DEFAULT_USER_AGENT,
    timeoutMs: 8000,
    rateLimitMs: 1000,
    country: 'in' // Target India catalog priority
  };

  let lastRequestTime = 0;

  function setConfig(newConfig = {}) {
    config = { ...config, ...newConfig };
  }

  // Throttle helper to respect Open Food Facts policy
  async function throttle() {
    const now = Date.now();
    const timeSinceLast = now - lastRequestTime;
    if (timeSinceLast < config.rateLimitMs) {
      const wait = config.rateLimitMs - timeSinceLast;
      await new Promise(r => setTimeout(r, wait));
    }
    lastRequestTime = Date.now();
  }

  /**
   * Fetches JSON with timeout and configured User-Agent
   */
  async function fetchWithTimeout(url, options = {}) {
    await throttle();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

    const headers = {
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers
      });
      clearTimeout(timeoutId);

      if (response.status === 429) {
        throw new Error('Open Food Facts Rate Limit exceeded (429). Please wait a moment.');
      }
      if (!response.ok) {
        throw new Error(`Open Food Facts API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Open Food Facts API request timed out.');
      }
      throw err;
    }
  }

  /**
   * Normalize an Open Food Facts product JSON item into canonical format
   */
  function normalizeOFFProduct(raw) {
    if (!raw || !raw.code) return null;

    const images = [];

    // Front image
    if (raw.image_front_url) {
      images.push(CatalogCore.createCanonicalImage({
        image_url: raw.image_front_url,
        thumbnail_url: raw.image_front_small_url || raw.image_front_url,
        image_role: 'front',
        is_primary: true,
        source_id: 'open_food_facts',
        source_url: `https://world.openfoodfacts.org/product/${raw.code}`,
        licence: 'CC-BY-SA 4.0',
        attribution: 'Open Food Facts contributors'
      }));
    }

    // Back image
    if (raw.image_back_url) {
      images.push(CatalogCore.createCanonicalImage({
        image_url: raw.image_back_url,
        thumbnail_url: raw.image_back_small_url || raw.image_back_url,
        image_role: 'back',
        is_primary: false,
        source_id: 'open_food_facts',
        source_url: `https://world.openfoodfacts.org/product/${raw.code}`,
        licence: 'CC-BY-SA 4.0',
        attribution: 'Open Food Facts contributors'
      }));
    }

    // Ingredients image
    if (raw.image_ingredients_url) {
      images.push(CatalogCore.createCanonicalImage({
        image_url: raw.image_ingredients_url,
        thumbnail_url: raw.image_ingredients_small_url || raw.image_ingredients_url,
        image_role: 'ingredients',
        is_primary: false,
        source_id: 'open_food_facts',
        source_url: `https://world.openfoodfacts.org/product/${raw.code}`,
        licence: 'CC-BY-SA 4.0',
        attribution: 'Open Food Facts contributors'
      }));
    }

    // Nutrition image
    if (raw.image_nutrition_url) {
      images.push(CatalogCore.createCanonicalImage({
        image_url: raw.image_nutrition_url,
        thumbnail_url: raw.image_nutrition_small_url || raw.image_nutrition_url,
        image_role: 'nutrition',
        is_primary: false,
        source_id: 'open_food_facts',
        source_url: `https://world.openfoodfacts.org/product/${raw.code}`,
        licence: 'CC-BY-SA 4.0',
        attribution: 'Open Food Facts contributors'
      }));
    }

    // Parse quantity and unit
    let netQty = '';
    let netUnit = 'g';
    if (raw.quantity) {
      const match = String(raw.quantity).match(/^([\d.,]+)\s*([a-zA-Z]+)?$/);
      if (match) {
        netQty = match[1];
        netUnit = match[2] || 'g';
      } else {
        netQty = raw.quantity;
      }
    }

    return CatalogCore.createCanonicalProduct({
      barcode: raw.code,
      product_name: raw.product_name || raw.product_name_en || 'Unknown Product',
      brand: raw.brands ? raw.brands.split(',')[0].trim() : '',
      category_id: raw.categories ? raw.categories.split(',')[0].trim() : 'Grocery',
      variant: '',
      net_quantity: netQty,
      net_unit: netUnit,
      mrp: null, // Open Food Facts does not provide standard POS retail prices
      selling_price: null,
      source_id: 'open_food_facts',
      source_record_id: raw.code,
      images: images
    });
  }

  /**
   * Barcode lookup: https://world.openfoodfacts.org/api/v2/product/{barcode}.json
   */
  async function getProductByBarcode(barcode) {
    const cleaned = CatalogCore.normalizeBarcode(barcode);
    if (!cleaned) return null;

    // Check IndexedDB cache first
    const cacheKey = `off_barcode_${cleaned}`;
    if (CatalogStorage && CatalogStorage.getCache) {
      const cached = await CatalogStorage.getCache(cacheKey);
      if (cached) return cached;
    }

    const url = `${BASE_URL}/api/v2/product/${encodeURIComponent(cleaned)}.json?fields=${SEARCH_FIELDS}`;
    const data = await fetchWithTimeout(url);

    if (data && data.status === 1 && data.product) {
      const canonical = normalizeOFFProduct(data.product);
      if (CatalogStorage && CatalogStorage.setCache) {
        await CatalogStorage.setCache(cacheKey, canonical, 86400000); // 24hr cache
      }
      return canonical;
    }

    return null;
  }

  /**
   * Full text search: https://world.openfoodfacts.org/cgi/search.pl
   */
  async function searchProducts(query, options = {}) {
    const q = String(query || '').trim();
    if (!q || q.length < 2) return [];

    const pageSize = options.pageSize || 15;
    const cacheKey = `off_search_${q.toLowerCase()}_${pageSize}`;

    if (CatalogStorage && CatalogStorage.getCache) {
      const cached = await CatalogStorage.getCache(cacheKey);
      if (cached) return cached;
    }

    // Target search endpoint with JSON return
    const url = `${BASE_URL}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${pageSize}&fields=${SEARCH_FIELDS}`;
    const data = await fetchWithTimeout(url);

    if (data && Array.isArray(data.products)) {
      const results = data.products
        .map(normalizeOFFProduct)
        .filter(p => p !== null && p.product_name && p.product_name !== 'Unknown Product');

      if (CatalogStorage && CatalogStorage.setCache) {
        await CatalogStorage.setCache(cacheKey, results, 3600000); // 1 hour cache
      }
      return results;
    }

    return [];
  }

  return {
    setConfig,
    getProductByBarcode,
    searchProducts,
    getProviderInfo: () => ({
      id: 'open_food_facts',
      name: 'Open Food Facts',
      licence: 'Database: ODbL 1.0, Images: CC-BY-SA 4.0',
      rateLimit: '1 request per second max'
    })
  };
}));
