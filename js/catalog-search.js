/**
 * js/catalog-search.js
 * Debounced search engine, active cancellation, barcode lookup and multi-provider aggregator.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./catalog-core'),
      require('./storage'),
      require('./providers/open-food-facts'),
      require('./providers/google-drive'),
      require('./providers/google-sheets')
    );
  } else {
    root.CatalogSearch = factory(
      root.CatalogCore,
      root.CatalogStorage,
      root.OpenFoodFactsProvider,
      root.GoogleDriveProvider,
      root.GoogleSheetsProvider
    );
  }
}(typeof self !== 'undefined' ? self : this, function (
  CatalogCore,
  CatalogStorage,
  OpenFoodFactsProvider,
  GoogleDriveProvider,
  GoogleSheetsProvider
) {
  'use strict';

  let currentSearchToken = 0;
  let sampleProductsCache = [];
  let enabledProviders = {
    local_indexeddb: true,
    sample_catalog: true,
    open_food_facts: true,
    google_drive: false,
    google_sheets: false
  };

  function setEnabledProviders(config) {
    enabledProviders = { ...enabledProviders, ...config };
  }

  function setSampleProducts(products) {
    sampleProductsCache = products.map(p => CatalogCore.createCanonicalProduct(p));
  }

  /**
   * Barcode exact lookup across local and remote sources
   */
  async function lookupBarcode(rawBarcode) {
    const barcode = CatalogCore.normalizeBarcode(rawBarcode);
    if (!barcode) return null;

    // 1. IndexedDB Check
    if (enabledProviders.local_indexeddb && CatalogStorage) {
      try {
        const local = await CatalogStorage.getProductByBarcode(barcode);
        if (local) return { source: 'IndexedDB', product: local };
      } catch (e) {
        console.warn('Local DB barcode lookup error:', e);
      }
    }

    // 2. In-memory synthetic Indian FMCG sample cache
    if (enabledProviders.sample_catalog && sampleProductsCache.length > 0) {
      const sample = sampleProductsCache.find(p => p.barcode === barcode);
      if (sample) return { source: 'Sample Catalog', product: sample };
    }

    // 3. Open Food Facts API
    if (enabledProviders.open_food_facts && OpenFoodFactsProvider) {
      try {
        const offProduct = await OpenFoodFactsProvider.getProductByBarcode(barcode);
        if (offProduct) return { source: 'Open Food Facts', product: offProduct };
      } catch (e) {
        console.warn('Open Food Facts barcode lookup failed:', e.message);
      }
    }

    // 4. Google Sheets
    if (enabledProviders.google_sheets && GoogleSheetsProvider) {
      try {
        const sheetProduct = await GoogleSheetsProvider.getProductByBarcode(barcode);
        if (sheetProduct) return { source: 'Google Sheets', product: sheetProduct };
      } catch (e) {
        console.warn('Google Sheets barcode lookup failed:', e.message);
      }
    }

    return null;
  }

  /**
   * Multi-source debounced query search with stale response protection
   */
  async function search(query, options = {}) {
    const searchToken = ++currentSearchToken;
    const q = String(query || '').trim().toLowerCase();
    const results = [];
    const seenBarcodes = new Set();
    const seenNames = new Set();

    function addProduct(prod) {
      if (!prod) return;
      if (prod.barcode && seenBarcodes.has(prod.barcode)) return;
      const key = `${(prod.brand || '').toLowerCase()}|${(prod.product_name || '').toLowerCase()}|${prod.net_quantity}${prod.net_unit}`;
      if (seenNames.has(key)) return;

      if (prod.barcode) seenBarcodes.add(prod.barcode);
      seenNames.add(key);
      results.push(prod);
    }

    // 1. Local IndexedDB search
    if (enabledProviders.local_indexeddb && CatalogStorage) {
      try {
        const allLocal = await CatalogStorage.getAllProducts();
        if (searchToken !== currentSearchToken) return null; // Abort stale

        allLocal.forEach(p => {
          if (!q ||
              (p.product_name && p.product_name.toLowerCase().includes(q)) ||
              (p.brand && p.brand.toLowerCase().includes(q)) ||
              (p.category_id && p.category_id.toLowerCase().includes(q)) ||
              (p.barcode && p.barcode.includes(q))) {
            addProduct(p);
          }
        });
      } catch (e) {
        console.warn('Local search error:', e);
      }
    }

    // 2. Sample FMCG dataset
    if (enabledProviders.sample_catalog && sampleProductsCache.length > 0) {
      sampleProductsCache.forEach(p => {
        if (!q ||
            (p.product_name && p.product_name.toLowerCase().includes(q)) ||
            (p.brand && p.brand.toLowerCase().includes(q)) ||
            (p.category_id && p.category_id.toLowerCase().includes(q)) ||
            (p.barcode && p.barcode.includes(q))) {
          addProduct(p);
        }
      });
    }

    // Check token before doing external fetches
    if (searchToken !== currentSearchToken) return null;

    // 3. Open Food Facts remote search (only when q is at least 3 chars)
    if (enabledProviders.open_food_facts && OpenFoodFactsProvider && q.length >= 3 && results.length < 20) {
      try {
        const offResults = await OpenFoodFactsProvider.searchProducts(q, { pageSize: 12 });
        if (searchToken === currentSearchToken) {
          offResults.forEach(addProduct);
        }
      } catch (err) {
        console.warn('Open Food Facts remote search non-fatal error:', err.message);
      }
    }

    // Check token before returning
    if (searchToken !== currentSearchToken) {
      return null; // A newer search has superseded this one
    }

    return results;
  }

  /**
   * Creates a debounced wrapper around a search callback
   */
  function createDebouncedSearch(callback, delayMs = 350) {
    let timeoutId = null;
    return function (...args) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        callback.apply(this, args);
      }, delayMs);
    };
  }

  return {
    setEnabledProviders,
    setSampleProducts,
    lookupBarcode,
    search,
    createDebouncedSearch
  };
}));
