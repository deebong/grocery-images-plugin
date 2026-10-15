/**
 * js/import-manager.js
 * CSV/JSON File Parser, column mapping, validation, duplicate detection,
 * batch processing, preview modal, rollback, and import error export.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./catalog-core'),
      require('./storage'),
      require('./providers/csv-provider')
    );
  } else {
    root.ImportManager = factory(
      root.CatalogCore,
      root.CatalogStorage,
      root.CsvProvider
    );
  }
}(typeof self !== 'undefined' ? self : this, function (CatalogCore, CatalogStorage, CsvProvider) {
  'use strict';

  let stagedImportList = [];
  let importStats = {
    total: 0,
    valid: 0,
    duplicates: 0,
    missingPrices: 0,
    missingImages: 0,
    errors: []
  };

  let importHistory = []; // stores backup sets for rollback

  /**
   * Processes uploaded raw file content (CSV or JSON)
   */
  async function parseImportFile(fileContent, fileName) {
    const isCsv = fileName.toLowerCase().endsWith('.csv');
    let canonicalRecords = [];
    importStats = {
      total: 0,
      valid: 0,
      duplicates: 0,
      missingPrices: 0,
      missingImages: 0,
      errors: []
    };

    try {
      if (isCsv) {
        canonicalRecords = CsvProvider.transformToCanonical(fileContent, true);
      } else {
        const parsed = JSON.parse(fileContent);
        canonicalRecords = CsvProvider.transformToCanonical(parsed, false);
      }
    } catch (err) {
      throw new Error(`File parsing failed: ${err.message}`);
    }

    // Validation & Audit pass
    const existingInDb = CatalogStorage ? await CatalogStorage.getAllProducts() : [];
    const existingBarcodeMap = new Map();
    existingInDb.forEach(p => {
      if (p.barcode) existingBarcodeMap.set(p.barcode, p);
    });

    const seenBarcodesInBatch = new Set();
    stagedImportList = canonicalRecords.map((item, idx) => {
      importStats.total++;
      const warnings = [];

      // Barcode validation
      if (!item.barcode) {
        warnings.push('No barcode specified');
      } else {
        if (existingBarcodeMap.has(item.barcode)) {
          importStats.duplicates++;
          warnings.push('Barcode exists in local catalog (will update/merge)');
        }
        if (seenBarcodesInBatch.has(item.barcode)) {
          warnings.push('Duplicate barcode within import file');
        } else {
          seenBarcodesInBatch.add(item.barcode);
        }
      }

      // Price checks
      if (item.selling_price === null && item.mrp === null) {
        importStats.missingPrices++;
        warnings.push('Missing selling price and MRP');
      }

      // Image checks
      if (!item.images || item.images.length === 0) {
        importStats.missingImages++;
        warnings.push('No pack-shot images');
      }

      const isValid = Boolean(item.product_name);
      if (isValid) {
        importStats.valid++;
      } else {
        importStats.errors.push(`Row ${idx + 1}: Missing required product name.`);
      }

      return {
        selected: isValid,
        data: item,
        warnings: warnings,
        isValid: isValid
      };
    });

    return {
      stats: importStats,
      records: stagedImportList
    };
  }

  /**
   * Commits the selected products to IndexedDB with chosen overwrite rules
   */
  async function executeImport(options = {}, onProgress = null) {
    const {
      preserveExistingPrices = true,
      imageOnlyMode = false,
      batchSize = 25
    } = options;

    const toImport = stagedImportList.filter(item => item.selected);
    if (toImport.length === 0) {
      throw new Error('No valid products selected for import.');
    }

    const currentCatalog = CatalogStorage ? await CatalogStorage.getAllProducts() : [];
    // Backup current state for rollback
    importHistory.push({
      timestamp: new Date().toISOString(),
      backup: JSON.parse(JSON.stringify(currentCatalog)),
      count: toImport.length
    });

    let catalogMap = new Map(currentCatalog.map(p => [p.product_id, p]));
    let barcodeMap = new Map();
    currentCatalog.forEach(p => {
      if (p.barcode) barcodeMap.set(p.barcode, p);
    });

    let processedCount = 0;
    const finalProductsToSave = [];

    for (let i = 0; i < toImport.length; i++) {
      const incoming = toImport[i].data;
      let existing = incoming.barcode ? barcodeMap.get(incoming.barcode) : null;

      if (existing) {
        if (imageOnlyMode) {
          // Only add missing images
          const urlSet = new Set((existing.images || []).map(img => img.image_url));
          (incoming.images || []).forEach(img => {
            if (!urlSet.has(img.image_url)) {
              existing.images.push(img);
            }
          });
          finalProductsToSave.push(existing);
        } else {
          // Deduplicate and merge
          const mergeResult = CatalogCore.deduplicateAndMerge([existing], incoming, {
            preserveExistingPrices
          });
          finalProductsToSave.push(mergeResult.product);
        }
      } else {
        // Insert new product
        finalProductsToSave.push(incoming);
      }

      processedCount++;
      if (onProgress && (processedCount % 5 === 0 || processedCount === toImport.length)) {
        onProgress(processedCount, toImport.length);
      }
    }

    // Batch save into IndexedDB
    if (CatalogStorage) {
      await CatalogStorage.bulkSaveProducts(finalProductsToSave);
    }

    return {
      status: 'completed',
      importedCount: processedCount,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Rollback the most recent import using saved backup snapshot
   */
  async function rollbackLastImport() {
    if (importHistory.length === 0) {
      throw new Error('No previous imports found in rollback history.');
    }
    const lastSession = importHistory.pop();
    if (CatalogStorage) {
      await CatalogStorage.clearAllProducts();
      await CatalogStorage.bulkSaveProducts(lastSession.backup);
    }
    return {
      status: 'rolled_back',
      restoredCount: lastSession.backup.length
    };
  }

  /**
   * Generates a downloadable CSV text report of skipped/errored rows
   */
  function exportErrorReportCSV() {
    const errorRows = [];
    stagedImportList.forEach((item, idx) => {
      if (!item.isValid || item.warnings.length > 0) {
        errorRows.push({
          row: idx + 1,
          barcode: item.data.barcode || '',
          product_name: item.data.product_name || '',
          status: item.isValid ? 'Warning' : 'Error',
          issues: item.warnings.join('; ')
        });
      }
    });

    const headers = ['Row Number', 'Barcode', 'Product Name', 'Status', 'Issues'];
    const lines = [headers.join(',')];

    errorRows.forEach(r => {
      lines.push([
        r.row,
        `"${r.barcode}"`,
        `"${(r.product_name || '').replace(/"/g, '""')}"`,
        `"${r.status}"`,
        `"${(r.issues || '').replace(/"/g, '""')}"`
      ].join(','));
    });

    return lines.join('\n');
  }

  function getStagedList() {
    return stagedImportList;
  }

  function toggleRecordSelection(index, isSelected) {
    if (stagedImportList[index]) {
      stagedImportList[index].selected = isSelected;
    }
  }

  function toggleAllSelection(selectAll) {
    stagedImportList.forEach(item => {
      if (item.isValid) {
        item.selected = selectAll;
      }
    });
  }

  return {
    parseImportFile,
    executeImport,
    rollbackLastImport,
    exportErrorReportCSV,
    getStagedList,
    toggleRecordSelection,
    toggleAllSelection,
    getStats: () => importStats
  };
}));
