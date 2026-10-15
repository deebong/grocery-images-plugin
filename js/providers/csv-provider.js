/**
 * js/providers/csv-provider.js
 * CSV/JSON parser, column mapping, validation and data normalization.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../catalog-core'));
  } else {
    root.CsvProvider = factory(root.CatalogCore);
  }
}(typeof self !== 'undefined' ? self : this, function (CatalogCore) {
  'use strict';

  /**
   * RFC 4180 compliant CSV parser supporting quoted text, newlines, commas and UTF-8 / Indian text.
   */
  function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;

    // Normalize Windows CRLF and CR to LF
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];
      const nextChar = cleanText[i + 1];

      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            // Escaped quote: ""
            currentField += '"';
            i++; // skip next quote
          } else {
            // Closing quote
            inQuotes = false;
          }
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          currentRow.push(currentField);
          currentField = '';
        } else if (char === '\n') {
          currentRow.push(currentField);
          if (currentRow.some(val => val.trim().length > 0)) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentField = '';
        } else {
          currentField += char;
        }
      }
    }

    if (currentField !== '' || currentRow.length > 0) {
      currentRow.push(currentField);
      if (currentRow.some(val => val.trim().length > 0)) {
        rows.push(currentRow);
      }
    }

    return rows;
  }

  /**
   * Detects header mapping from CSV headers
   */
  function detectColumnMapping(headers) {
    const mapping = {
      barcode: -1,
      product_name: -1,
      brand: -1,
      category: -1,
      variant: -1,
      net_quantity: -1,
      net_unit: -1,
      mrp: -1,
      selling_price: -1,
      image_url: -1,
      image_role: -1,
      licence: -1,
      attribution: -1,
      source_url: -1
    };

    const cleanHeaders = headers.map(h => (h || '').trim().toLowerCase().replace(/[\s\-_]/g, ''));

    cleanHeaders.forEach((header, idx) => {
      if (['barcode', 'ean', 'gtin', 'upc', 'code', 'productcode'].includes(header)) {
        if (mapping.barcode === -1) mapping.barcode = idx;
      } else if (['productname', 'name', 'title', 'itemname', 'item'].includes(header)) {
        if (mapping.product_name === -1) mapping.product_name = idx;
      } else if (['brand', 'brandname', 'manufacturer'].includes(header)) {
        if (mapping.brand === -1) mapping.brand = idx;
      } else if (['category', 'cat', 'categoryname', 'department'].includes(header)) {
        if (mapping.category === -1) mapping.category = idx;
      } else if (['variant', 'size', 'flavor', 'flavour'].includes(header)) {
        if (mapping.variant === -1) mapping.variant = idx;
      } else if (['netquantity', 'quantity', 'qty', 'weight', 'packquantity', 'packsize'].includes(header)) {
        if (mapping.net_quantity === -1) mapping.net_quantity = idx;
      } else if (['netunit', 'unit', 'uom', 'packunit'].includes(header)) {
        if (mapping.net_unit === -1) mapping.net_unit = idx;
      } else if (['mrp', 'maximumretailprice', 'listprice'].includes(header)) {
        if (mapping.mrp === -1) mapping.mrp = idx;
      } else if (['sellingprice', 'price', 'retailprice', 'ourprice', 'sp'].includes(header)) {
        if (mapping.selling_price === -1) mapping.selling_price = idx;
      } else if (['imageurl', 'image', 'photo', 'picture', 'packshot', 'frontimage'].includes(header)) {
        if (mapping.image_url === -1) mapping.image_url = idx;
      } else if (['imagerole', 'role', 'imagetype'].includes(header)) {
        if (mapping.image_role === -1) mapping.image_role = idx;
      } else if (['licence', 'license', 'imagelicence'].includes(header)) {
        if (mapping.licence === -1) mapping.licence = idx;
      } else if (['attribution', 'credit', 'sourcecredit'].includes(header)) {
        if (mapping.attribution === -1) mapping.attribution = idx;
      } else if (['sourceurl', 'url', 'producturl', 'link'].includes(header)) {
        if (mapping.source_url === -1) mapping.source_url = idx;
      }
    });

    return mapping;
  }

  /**
   * Transforms raw CSV or JSON data into normalized Canonical Products
   */
  function transformToCanonical(records, isRawCSV = false, customMapping = null) {
    let rows = records;
    let mapping = customMapping;

    if (isRawCSV) {
      const parsed = parseCSV(records);
      if (parsed.length < 2) {
        throw new Error('CSV must contain a header row and at least one data row.');
      }
      const headers = parsed[0];
      if (!mapping) {
        mapping = detectColumnMapping(headers);
      }
      const dataRows = parsed.slice(1);

      return dataRows.map(row => {
        const getVal = (field) => {
          const idx = mapping[field];
          return (idx !== -1 && idx !== undefined && row[idx] !== undefined) ? row[idx].trim() : '';
        };

        const imageUrl = getVal('image_url');
        const images = imageUrl ? [{
          image_url: imageUrl,
          image_role: getVal('image_role') || 'front',
          is_primary: true,
          licence: getVal('licence') || 'CC-BY-SA 4.0',
          attribution: getVal('attribution') || 'Custom Catalog Upload',
          source_url: getVal('source_url') || ''
        }] : [];

        return CatalogCore.createCanonicalProduct({
          barcode: getVal('barcode'),
          product_name: getVal('product_name'),
          brand: getVal('brand'),
          category_id: getVal('category') || 'General Grocery',
          variant: getVal('variant'),
          net_quantity: getVal('net_quantity'),
          net_unit: getVal('net_unit') || 'g',
          mrp: getVal('mrp'),
          selling_price: getVal('selling_price'),
          source_id: 'csv_importer',
          images: images
        });
      });
    }

    // Handled as JSON Array
    if (!Array.isArray(records)) {
      throw new Error('JSON data must be an array of product objects.');
    }

    return records.map(item => {
      let images = [];
      if (Array.isArray(item.images)) {
        images = item.images;
      } else if (item.image_url) {
        images = [{
          image_url: item.image_url,
          image_role: item.image_role || 'front',
          is_primary: true,
          licence: item.licence || 'CC-BY-SA 4.0',
          attribution: item.attribution || 'JSON Catalog Upload',
          source_url: item.source_url || ''
        }];
      }

      return CatalogCore.createCanonicalProduct({
        product_id: item.product_id,
        barcode: item.barcode,
        product_name: item.product_name || item.name,
        brand: item.brand,
        category_id: item.category || item.category_id || 'General Grocery',
        variant: item.variant,
        net_quantity: item.net_quantity || item.pack_quantity,
        net_unit: item.net_unit || item.pack_unit || 'g',
        mrp: item.mrp,
        selling_price: item.selling_price || item.price,
        currency: item.currency || 'INR',
        source_id: 'csv_importer',
        images: images
      });
    });
  }

  return {
    parseCSV,
    detectColumnMapping,
    transformToCanonical
  };
}));
