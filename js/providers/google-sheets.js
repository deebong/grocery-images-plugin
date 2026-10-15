/**
 * js/providers/google-sheets.js
 * Google Apps Script Web App / Google Sheets Catalog Provider
 * Supports remote sync, search, and catalog imports without embedding secrets.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../catalog-core'));
  } else {
    root.GoogleSheetsProvider = factory(root.CatalogCore);
  }
}(typeof self !== 'undefined' ? self : this, function (CatalogCore) {
  'use strict';

  let config = {
    webAppUrl: '',
    useMockMode: true,
    timeoutMs: 8000
  };

  // Mock catalog rows returned by Apps Script
  const MOCK_SHEETS_DATA = [
    {
      barcode: '8901030383700',
      product_name: 'Tata Salt 1kg (Sheets Sync)',
      brand: 'Tata',
      category: 'Staples',
      mrp: 28,
      selling_price: 26,
      image_url: 'https://images.openfoodfacts.org/images/products/890/103/038/3700/front_en.13.400.jpg'
    }
  ];

  function setConfig(newConfig = {}) {
    config = { ...config, ...newConfig };
    if (config.webAppUrl && config.webAppUrl.startsWith('https://script.google.com')) {
      config.useMockMode = false;
    }
  }

  async function executeAction(action, payload = {}) {
    if (config.useMockMode || !config.webAppUrl) {
      if (action === 'search') {
        const q = (payload.query || '').toLowerCase();
        return MOCK_SHEETS_DATA.filter(p => p.product_name.toLowerCase().includes(q) || p.barcode.includes(q));
      }
      if (action === 'getByBarcode') {
        return MOCK_SHEETS_DATA.find(p => p.barcode === payload.barcode) || null;
      }
      return { status: 'mock_success', message: 'Mock Sheets action executed' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    const queryParams = new URLSearchParams({
      action: action,
      ...payload
    }).toString();

    try {
      const res = await fetch(`${config.webAppUrl}?${queryParams}`, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`Google Apps Script error: ${res.status} ${res.statusText}`);
      }

      const json = await res.json();
      if (json.status === 'error') {
        throw new Error(json.message || 'Apps Script returned error');
      }
      return json.data || json;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  async function searchProducts(query) {
    const rawList = await executeAction('search', { query });
    if (!Array.isArray(rawList)) return [];

    return rawList.map(item => CatalogCore.createCanonicalProduct({
      barcode: item.barcode,
      product_name: item.product_name,
      brand: item.brand,
      category_id: item.category,
      mrp: item.mrp,
      selling_price: item.selling_price,
      source_id: 'google_sheets',
      images: item.image_url ? [{
        image_url: item.image_url,
        is_primary: true,
        image_role: 'front',
        licence: 'Proprietary / Brand Authorized',
        attribution: 'Connected Google Sheet'
      }] : []
    }));
  }

  async function getProductByBarcode(barcode) {
    const raw = await executeAction('getByBarcode', { barcode });
    if (!raw) return null;

    return CatalogCore.createCanonicalProduct({
      barcode: raw.barcode,
      product_name: raw.product_name,
      brand: raw.brand,
      category_id: raw.category,
      mrp: raw.mrp,
      selling_price: raw.selling_price,
      source_id: 'google_sheets',
      images: raw.image_url ? [{
        image_url: raw.image_url,
        is_primary: true,
        image_role: 'front',
        licence: 'Proprietary / Brand Authorized',
        attribution: 'Connected Google Sheet'
      }] : []
    });
  }

  return {
    setConfig,
    executeAction,
    searchProducts,
    getProductByBarcode,
    getProviderInfo: () => ({
      id: 'google_sheets',
      name: 'Google Sheets / Apps Script Provider',
      isMock: config.useMockMode
    })
  };
}));
