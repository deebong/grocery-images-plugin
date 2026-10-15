/**
 * js/catalog-core.js
 * Canonical product schema, normalization, barcode validation, and deduplication engine.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CatalogCore = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Generates a reproducible or random UUID v4
   */
  function generateId(prefix = 'prod') {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `${prefix}_${crypto.randomUUID()}`;
    }
    const rand = Math.random().toString(36).substring(2, 10);
    const time = Date.now().toString(36);
    return `${prefix}_${time}_${rand}`;
  }

  /**
   * Sanitizes text strings to prevent HTML injection (XSS defense)
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Validates and normalizes barcodes (EAN-13, EAN-8, UPC-A, etc.)
   * Preserves leading zeroes as strings!
   */
  function normalizeBarcode(rawBarcode) {
    if (rawBarcode === null || rawBarcode === undefined) return '';
    const cleaned = String(rawBarcode).trim().replace(/[\s\-]/g, '');
    // Check if barcode consists solely of digits
    if (!/^\d+$/.test(cleaned)) {
      return cleaned; // preserve as string for manual reconciliation
    }
    return cleaned;
  }

  /**
   * Validates EAN-13 / UPC-A checksum
   */
  function isValidBarcodeChecksum(barcodeStr) {
    if (!barcodeStr || !/^\d{8}$|^\d{12,14}$/.test(barcodeStr)) {
      return false;
    }
    const len = barcodeStr.length;
    const digits = barcodeStr.split('').map(Number);
    const checkDigit = digits[len - 1];
    let sum = 0;
    for (let i = 0; i < len - 1; i++) {
      const weight = ((len - 1 - i) % 2 === 1) ? 3 : 1;
      sum += digits[i] * weight;
    }
    const calc = (10 - (sum % 10)) % 10;
    return calc === checkDigit;
  }

  /**
   * Canonical Image Object Builder
   */
  function createCanonicalImage(img = {}) {
    const validUrl = (url) => {
      if (!url || typeof url !== 'string') return '';
      const u = url.trim();
      return /^(https?:\/\/|data:image\/)/i.test(u) ? u : '';
    };

    return {
      image_id: img.image_id || generateId('img'),
      product_id: img.product_id || '',
      image_url: validUrl(img.image_url),
      thumbnail_url: validUrl(img.thumbnail_url) || validUrl(img.image_url),
      image_role: img.image_role || 'front', // 'front' | 'back' | 'ingredients' | 'nutrition' | 'packaging' | 'other'
      is_primary: Boolean(img.is_primary),
      source_id: img.source_id || 'manual', // 'open_food_facts' | 'google_drive' | 'csv' | 'pos'
      source_url: validUrl(img.source_url) || '',
      licence: img.licence || 'CC-BY-SA 4.0', // 'CC0' | 'CC-BY' | 'CC-BY-SA' | 'Proprietary' | 'Unknown'
      attribution: img.attribution || 'Open Food Facts contributors',
      verification_status: img.verification_status || 'verified', // 'verified' | 'unverified' | 'flagged'
      checksum: img.checksum || '',
      updated_at: img.updated_at || new Date().toISOString()
    };
  }

  /**
   * Canonical Product Object Builder
   */
  function createCanonicalProduct(data = {}) {
    const rawBarcode = data.barcode !== undefined && data.barcode !== null ? String(data.barcode) : '';
    const normBarcode = normalizeBarcode(rawBarcode);

    // Normalize images list
    const rawImages = Array.isArray(data.images) ? data.images : [];
    let images = rawImages.map(img => createCanonicalImage(img));

    // Ensure at least one primary image exists if images array is not empty
    if (images.length > 0 && !images.some(img => img.is_primary)) {
      images[0].is_primary = true;
    }

    const prodId = data.product_id || (normBarcode ? `prod_${normBarcode}` : generateId('prod'));

    images.forEach(img => {
      if (!img.product_id) img.product_id = prodId;
    });

    return {
      product_id: prodId,
      barcode: normBarcode,
      product_name: String(data.product_name || data.name || '').trim(),
      brand: String(data.brand || '').trim(),
      category_id: String(data.category_id || data.category || 'General Grocery').trim(),
      variant: String(data.variant || '').trim(),
      net_quantity: String(data.net_quantity || data.pack_quantity || '').trim(),
      net_unit: String(data.net_unit || data.pack_unit || 'g').trim(),
      mrp: isNaN(parseFloat(data.mrp)) ? null : parseFloat(data.mrp),
      selling_price: isNaN(parseFloat(data.selling_price || data.price)) ? null : parseFloat(data.selling_price || data.price),
      currency: String(data.currency || 'INR').trim(),
      source_id: data.source_id || 'manual',
      source_record_id: String(data.source_record_id || data.barcode || ''),
      images: images,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Deduplication and Record Merging Strategy
   * Prioritizes barcode exact match, falls back to composite key (brand + name + quantity).
   * Does NOT overwrite operational retailer fields if skipPriceOverwrite is set.
   */
  function deduplicateAndMerge(existingList, incomingProduct, options = {}) {
    const {
      preserveExistingPrices = true,
      imageMergeStrategy = 'union', // 'union' | 'replace' | 'keep_existing'
      sourcePriority = ['local_indexeddb', 'csv_importer', 'open_food_facts', 'sample_catalog']
    } = options;

    let matchIdx = -1;

    // 1. Barcode match
    if (incomingProduct.barcode) {
      matchIdx = existingList.findIndex(p => p.barcode && p.barcode === incomingProduct.barcode);
    }

    // 2. Fallback: Composite Key match
    if (matchIdx === -1 && incomingProduct.product_name && incomingProduct.brand) {
      const incomingKey = `${incomingProduct.brand.toLowerCase()}|${incomingProduct.product_name.toLowerCase()}|${incomingProduct.net_quantity}${incomingProduct.net_unit}`.replace(/\s+/g, '');
      matchIdx = existingList.findIndex(p => {
        const existingKey = `${p.brand.toLowerCase()}|${p.product_name.toLowerCase()}|${p.net_quantity}${p.net_unit}`.replace(/\s+/g, '');
        return existingKey === incomingKey;
      });
    }

    if (matchIdx === -1) {
      // New record
      return {
        action: 'inserted',
        product: incomingProduct,
        index: -1
      };
    }

    const existing = existingList[matchIdx];
    const merged = { ...existing };

    // Selective field merges
    merged.product_name = incomingProduct.product_name || existing.product_name;
    merged.brand = incomingProduct.brand || existing.brand;
    merged.category_id = incomingProduct.category_id || existing.category_id;
    merged.variant = incomingProduct.variant || existing.variant;
    merged.net_quantity = incomingProduct.net_quantity || existing.net_quantity;
    merged.net_unit = incomingProduct.net_unit || existing.net_unit;

    // Price preservation rule
    if (!preserveExistingPrices || existing.selling_price === null) {
      if (incomingProduct.selling_price !== null) {
        merged.selling_price = incomingProduct.selling_price;
      }
    }
    if (!preserveExistingPrices || existing.mrp === null) {
      if (incomingProduct.mrp !== null) {
        merged.mrp = incomingProduct.mrp;
      }
    }

    // Image merge logic
    if (imageMergeStrategy === 'replace' && incomingProduct.images.length > 0) {
      merged.images = incomingProduct.images;
    } else if (imageMergeStrategy === 'union') {
      const urlMap = new Map();
      (existing.images || []).forEach(img => urlMap.set(img.image_url, img));
      (incomingProduct.images || []).forEach(img => {
        if (!urlMap.has(img.image_url)) {
          urlMap.set(img.image_url, img);
        }
      });
      merged.images = Array.from(urlMap.values());
    }

    merged.updated_at = new Date().toISOString();

    return {
      action: 'merged',
      product: merged,
      index: matchIdx
    };
  }

  return {
    generateId,
    escapeHtml,
    normalizeBarcode,
    isValidBarcodeChecksum,
    createCanonicalImage,
    createCanonicalProduct,
    deduplicateAndMerge
  };
}));
