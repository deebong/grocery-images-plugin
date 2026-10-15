/**
 * js/app.js
 * Main UI Controller, Event Handlers, Tab Navigation, and Application Orchestration.
 */

(function () {
  'use strict';

  let currentSearchResults = [];
  let currentEditingProduct = null;

  // Initialize Application on DOM Ready
  document.addEventListener('DOMContentLoaded', async () => {
    await initDatabase();
    await loadInitialCatalog();
    setupEventListeners();
    updateCatalogStats();
    setupScannerSupport();
  });

  async function initDatabase() {
    try {
      if (window.CatalogStorage) {
        await window.CatalogStorage.openDatabase();
      }
    } catch (e) {
      console.warn('IndexedDB initialization failed, will run in-memory fallback:', e);
    }
  }

  async function loadInitialCatalog() {
    try {
      const res = await fetch('sample-products.json');
      if (res.ok) {
        const samples = await res.json();
        if (window.CatalogSearch) {
          window.CatalogSearch.setSampleProducts(samples);
        }

        // Check if IndexedDB is empty, prefill with samples
        const existing = await window.CatalogStorage.getAllProducts();
        if (existing.length === 0) {
          const canonical = samples.map(p => window.CatalogCore.createCanonicalProduct(p));
          await window.CatalogStorage.bulkSaveProducts(canonical);
        }
      }
    } catch (e) {
      console.warn('Could not load sample-products.json:', e);
    }

    // Trigger initial search to display local products
    triggerSearch('');
  }

  function setupEventListeners() {
    // Navigation Tabs
    const tabButtons = document.querySelectorAll('[data-tab-target]');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget.getAttribute('data-tab-target');
        switchTab(target);
      });
    });

    // Search Input with Debounce (350ms)
    const searchInput = document.getElementById('catalogSearchInput');
    if (searchInput) {
      const debounced = window.CatalogSearch.createDebouncedSearch((val) => {
        triggerSearch(val);
      }, 350);
      searchInput.addEventListener('input', (e) => debounced(e.target.value));
    }

    // Barcode Dedicated Lookup Button
    const barcodeBtn = document.getElementById('barcodeLookupBtn');
    if (barcodeBtn) {
      barcodeBtn.addEventListener('click', () => {
        const barcodeInput = document.getElementById('barcodeSearchInput');
        if (barcodeInput && barcodeInput.value) {
          handleBarcodeLookup(barcodeInput.value.trim());
        }
      });
    }

    // Barcode Search Enter Key handler
    const barcodeInput = document.getElementById('barcodeSearchInput');
    if (barcodeInput) {
      barcodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleBarcodeLookup(barcodeInput.value.trim());
        }
      });
    }

    // Provider Config Toggles
    const providerCheckboxes = document.querySelectorAll('[data-provider-toggle]');
    providerCheckboxes.forEach(cb => {
      cb.addEventListener('change', (e) => {
        const prov = e.target.getAttribute('data-provider-toggle');
        const enabled = e.target.checked;
        const config = {};
        config[prov] = enabled;
        window.CatalogSearch.setEnabledProviders(config);
      });
    });

    // File Import Drag & Drop / Input
    const fileInput = document.getElementById('catalogFileInput');
    if (fileInput) {
      fileInput.addEventListener('change', handleFileUpload);
    }

    // Import Action Buttons
    const executeImportBtn = document.getElementById('executeImportBtn');
    if (executeImportBtn) {
      executeImportBtn.addEventListener('click', handleExecuteImport);
    }

    const rollbackBtn = document.getElementById('rollbackImportBtn');
    if (rollbackBtn) {
      rollbackBtn.addEventListener('click', handleRollbackImport);
    }

    const exportErrorBtn = document.getElementById('exportImportErrorsBtn');
    if (exportErrorBtn) {
      exportErrorBtn.addEventListener('click', handleExportErrors);
    }

    // Select All / Deselect All import check
    const selectAllImportCheck = document.getElementById('selectAllImportCheckbox');
    if (selectAllImportCheck) {
      selectAllImportCheck.addEventListener('change', (e) => {
        window.ImportManager.toggleAllSelection(e.target.checked);
        renderImportPreview();
      });
    }
  }

  // Physical Barcode Scanner listener (emits keystrokes followed by Enter)
  function setupScannerSupport() {
    let scanBuffer = '';
    let scanTimeout = null;

    document.addEventListener('keydown', (e) => {
      // Ignore if user is currently typing inside a form text input
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }

      if (e.key === 'Enter') {
        if (scanBuffer.length >= 6) {
          const barcode = scanBuffer;
          scanBuffer = '';
          const barcodeInput = document.getElementById('barcodeSearchInput');
          if (barcodeInput) barcodeInput.value = barcode;
          switchTab('searchTab');
          handleBarcodeLookup(barcode);
        }
        scanBuffer = '';
        return;
      }

      // Check numeric/alphanumeric characters
      if (e.key.length === 1) {
        scanBuffer += e.key;
        clearTimeout(scanTimeout);
        scanTimeout = setTimeout(() => {
          scanBuffer = '';
        }, 120); // typical hardware scanners emit characters within 50ms intervals
      }
    });
  }

  function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('[data-tab-target]').forEach(btn => {
      btn.classList.remove('border-emerald-600', 'text-emerald-700', 'bg-emerald-50');
      btn.classList.add('text-gray-600', 'border-transparent');
    });

    const targetEl = document.getElementById(tabId);
    if (targetEl) targetEl.classList.remove('hidden');

    const activeBtn = document.querySelector(`[data-tab-target="${tabId}"]`);
    if (activeBtn) {
      activeBtn.classList.add('border-emerald-600', 'text-emerald-700', 'bg-emerald-50');
      activeBtn.classList.remove('text-gray-600', 'border-transparent');
    }

    if (tabId === 'searchTab') {
      updateCatalogStats();
    }
  }

  async function triggerSearch(query) {
    const loadingEl = document.getElementById('searchLoadingIndicator');
    const container = document.getElementById('productResultsGrid');
    const emptyState = document.getElementById('emptySearchState');

    if (loadingEl) loadingEl.classList.remove('hidden');

    try {
      const results = await window.CatalogSearch.search(query);
      if (results === null) {
        return; // Stale request cancelled
      }

      currentSearchResults = results;
      renderProductCards(results);

      if (loadingEl) loadingEl.classList.add('hidden');
      if (emptyState) {
        if (results.length === 0) {
          emptyState.classList.remove('hidden');
          container.classList.add('hidden');
        } else {
          emptyState.classList.add('hidden');
          container.classList.remove('hidden');
        }
      }
    } catch (err) {
      if (loadingEl) loadingEl.classList.add('hidden');
      console.error('Search failure:', err);
    }
  }

  async function handleBarcodeLookup(rawBarcode) {
    const clean = window.CatalogCore.normalizeBarcode(rawBarcode);
    if (!clean) return;

    const loadingEl = document.getElementById('searchLoadingIndicator');
    if (loadingEl) loadingEl.classList.remove('hidden');

    const result = await window.CatalogSearch.lookupBarcode(clean);
    if (loadingEl) loadingEl.classList.add('hidden');

    if (result && result.product) {
      currentSearchResults = [result.product];
      renderProductCards([result.product]);
      showNotification(`Found barcode match from ${result.source}`, 'success');
    } else {
      currentSearchResults = [];
      renderProductCards([]);
      showNotification(`No product found for barcode "${clean}". You can create it in the editor.`, 'info');
    }
  }

  function renderProductCards(products) {
    const container = document.getElementById('productResultsGrid');
    if (!container) return;

    if (!products || products.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = products.map(prod => {
      const primaryImg = (prod.images || []).find(img => img.is_primary) || (prod.images && prod.images[0]);
      const imgUrl = primaryImg ? primaryImg.thumbnail_url || primaryImg.image_url : '';
      const licenceInfo = primaryImg ? window.LicensingEngine.inspectLicence(primaryImg.licence) : null;

      const mrpText = prod.mrp ? `₹${parseFloat(prod.mrp).toFixed(2)}` : '<span class="text-gray-400">Not set</span>';
      const spText = prod.selling_price ? `₹${parseFloat(prod.selling_price).toFixed(2)}` : '<span class="text-gray-400">Not set</span>';

      return `
        <div class="product-card bg-white rounded-xl border border-gray-200 hover:border-emerald-500 shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden animate-fade-in group">
          <!-- Image Box -->
          <div class="product-card-img-container h-44 bg-gray-50 flex items-center justify-center p-3 relative border-b border-gray-100 cursor-pointer" onclick="window.GroceryApp.openImagePickerForProduct('${prod.product_id}')">
            ${imgUrl ? `
              <img src="${window.CatalogCore.escapeHtml(imgUrl)}"
                   alt="${window.CatalogCore.escapeHtml(prod.product_name)}"
                   class="max-h-full max-w-full object-contain"
                   onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'120\\' height=\\'120\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%23cbd5e1\\' stroke-width=\\'1.5\\'><rect width=\\'18\\' height=\\'18\\' x=\\'3\\' y=\\'3\\' rx=\\'2\\'/><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'/><path d=\\'m21 15-5-5L5 21\\'/></svg>';">
            ` : `
              <div class="flex flex-col items-center justify-center text-gray-400">
                <svg class="w-10 h-10 stroke-current mb-1" fill="none" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2" stroke-width="1.5"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21" stroke-width="1.5"/></svg>
                <span class="text-[11px]">No pack-shot</span>
              </div>
            `}

            <!-- Pack Size pill -->
            ${prod.net_quantity ? `
              <span class="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded">
                ${window.CatalogCore.escapeHtml(prod.net_quantity)} ${window.CatalogCore.escapeHtml(prod.net_unit || 'g')}
              </span>
            ` : ''}

            <!-- Multi Image Counter -->
            ${(prod.images && prod.images.length > 1) ? `
              <span class="absolute top-2 right-2 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                <svg class="w-3 h-3 fill-current" viewBox="0 0 20 20"><path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"/></svg>
                ${prod.images.length} images
              </span>
            ` : ''}
          </div>

          <!-- Product Body -->
          <div class="p-3.5 flex-1 flex flex-col justify-between space-y-2">
            <div>
              <div class="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                <span class="font-semibold text-emerald-800 uppercase tracking-wider">${window.CatalogCore.escapeHtml(prod.brand || 'Unbranded')}</span>
                <span class="bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">${window.CatalogCore.escapeHtml(prod.category_id || 'Grocery')}</span>
              </div>
              <h3 class="font-semibold text-gray-900 text-sm line-clamp-2 leading-snug group-hover:text-emerald-700 transition-colors" title="${window.CatalogCore.escapeHtml(prod.product_name)}">
                ${window.CatalogCore.escapeHtml(prod.product_name)}
              </h3>
              ${prod.barcode ? `
                <div class="text-[11px] font-mono text-gray-500 mt-1 flex items-center gap-1">
                  <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/></svg>
                  <span>${window.CatalogCore.escapeHtml(prod.barcode)}</span>
                </div>
              ` : ''}
            </div>

            <!-- Pricing & Licence -->
            <div class="pt-2 border-t border-gray-100 space-y-1.5">
              <div class="flex items-baseline justify-between text-xs">
                <div>
                  <span class="text-gray-400 text-[10px]">MRP:</span> <span class="line-through text-gray-500 text-[11px] mr-1.5">${mrpText}</span>
                  <span class="text-gray-500 text-[10px]">SP:</span> <span class="font-bold text-emerald-700 text-sm">${spText}</span>
                </div>
                ${licenceInfo ? `
                  <span class="text-[10px] px-1.5 py-0.5 rounded font-medium ${licenceInfo.badgeClass}" title="${window.CatalogCore.escapeHtml(licenceInfo.name)}">
                    ${window.CatalogCore.escapeHtml(primaryImg.licence || 'CC-BY-SA')}
                  </span>
                ` : ''}
              </div>

              <!-- Action Bar -->
              <div class="flex items-center gap-1.5 pt-1">
                <button type="button" onclick="window.GroceryApp.openImagePickerForProduct('${prod.product_id}')" class="flex-1 py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-medium rounded-lg flex items-center justify-center gap-1 transition-colors">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  Images (${(prod.images || []).length})
                </button>
                <button type="button" onclick="window.GroceryApp.openProductEditor('${prod.product_id}')" class="py-1.5 px-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors" title="Edit product fields">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                </button>
                <button type="button" onclick="window.GroceryApp.selectForPos('${prod.product_id}')" class="py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors" title="Send to POS Cart/Form">
                  Use in POS
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function openImagePickerForProduct(productId) {
    const prod = currentSearchResults.find(p => p.product_id === productId);
    if (!prod) return;

    window.ImagePicker.openPicker(prod, async (updatedProduct) => {
      // Save changes back to IndexedDB
      await window.CatalogStorage.saveProduct(updatedProduct);
      // Update in-memory state
      const idx = currentSearchResults.findIndex(p => p.product_id === productId);
      if (idx !== -1) currentSearchResults[idx] = updatedProduct;
      renderProductCards(currentSearchResults);
      showNotification('Pack-shot images updated successfully', 'success');
    });
  }

  function openProductEditor(productId) {
    const prod = productId ? currentSearchResults.find(p => p.product_id === productId) : null;
    currentEditingProduct = prod || window.CatalogCore.createCanonicalProduct({});

    document.getElementById('editProductId').value = currentEditingProduct.product_id || '';
    document.getElementById('editBarcode').value = currentEditingProduct.barcode || '';
    document.getElementById('editProductName').value = currentEditingProduct.product_name || '';
    document.getElementById('editBrand').value = currentEditingProduct.brand || '';
    document.getElementById('editCategory').value = currentEditingProduct.category_id || 'Staples';
    document.getElementById('editVariant').value = currentEditingProduct.variant || '';
    document.getElementById('editNetQuantity').value = currentEditingProduct.net_quantity || '';
    document.getElementById('editNetUnit').value = currentEditingProduct.net_unit || 'g';
    document.getElementById('editMrp').value = currentEditingProduct.mrp !== null ? currentEditingProduct.mrp : '';
    document.getElementById('editSellingPrice').value = currentEditingProduct.selling_price !== null ? currentEditingProduct.selling_price : '';

    const primaryImg = (currentEditingProduct.images || []).find(i => i.is_primary) || (currentEditingProduct.images && currentEditingProduct.images[0]);
    document.getElementById('editPrimaryImageUrl').value = primaryImg ? primaryImg.image_url : '';

    switchTab('editorTab');
  }

  async function handleSaveEditedProduct(e) {
    if (e) e.preventDefault();

    const prodId = document.getElementById('editProductId').value || window.CatalogCore.generateId('prod');
    const barcode = document.getElementById('editBarcode').value.trim();
    const name = document.getElementById('editProductName').value.trim();

    if (!name) {
      alert('Product Name is required.');
      return;
    }

    const mrpVal = parseFloat(document.getElementById('editMrp').value);
    const spVal = parseFloat(document.getElementById('editSellingPrice').value);
    const primaryUrl = document.getElementById('editPrimaryImageUrl').value.trim();

    let images = currentEditingProduct.images || [];
    if (primaryUrl) {
      const existing = images.find(i => i.image_url === primaryUrl);
      if (existing) {
        images.forEach(i => i.is_primary = (i.image_url === primaryUrl));
      } else {
        images.forEach(i => i.is_primary = false);
        images.unshift(window.CatalogCore.createCanonicalImage({
          image_url: primaryUrl,
          is_primary: true,
          licence: 'Proprietary / Brand Authorized',
          attribution: 'Manual Product Editor'
        }));
      }
    }

    const updated = window.CatalogCore.createCanonicalProduct({
      product_id: prodId,
      barcode: barcode,
      product_name: name,
      brand: document.getElementById('editBrand').value.trim(),
      category_id: document.getElementById('editCategory').value.trim(),
      variant: document.getElementById('editVariant').value.trim(),
      net_quantity: document.getElementById('editNetQuantity').value.trim(),
      net_unit: document.getElementById('editNetUnit').value.trim(),
      mrp: isNaN(mrpVal) ? null : mrpVal,
      selling_price: isNaN(spVal) ? null : spVal,
      currency: 'INR',
      images: images
    });

    await window.CatalogStorage.saveProduct(updated);
    showNotification('Product saved to Local IndexedDB', 'success');
    switchTab('searchTab');
    triggerSearch('');
  }

  function selectForPos(productId) {
    const prod = currentSearchResults.find(p => p.product_id === productId);
    if (!prod) return;

    if (window.ProductCatalogPicker) {
      window.ProductCatalogPicker.confirmProductSelection(prod);
      showNotification(`Selected "${prod.product_name}" for POS checkout/form`, 'success');
    }
  }

  // --- Import Handler ---
  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target.result;
        const res = await window.ImportManager.parseImportFile(content, file.name);
        renderImportPreview();
        showNotification(`Parsed ${res.stats.total} products with ${res.stats.duplicates} existing matches.`, 'info');
      } catch (err) {
        alert(err.message);
      }
    };
    reader.readAsText(file);
  }

  function renderImportPreview() {
    const stats = window.ImportManager.getStats();
    const records = window.ImportManager.getStagedList();

    const summaryEl = document.getElementById('importStatsSummary');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div class="bg-gray-50 p-2.5 rounded-lg border border-gray-200">
            <span class="text-xs text-gray-500 block">Total Records</span>
            <span class="text-lg font-bold text-gray-800">${stats.total}</span>
          </div>
          <div class="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
            <span class="text-xs text-emerald-600 block">Valid Eligible</span>
            <span class="text-lg font-bold text-emerald-800">${stats.valid}</span>
          </div>
          <div class="bg-amber-50 p-2.5 rounded-lg border border-amber-200">
            <span class="text-xs text-amber-600 block">Existing Updates</span>
            <span class="text-lg font-bold text-amber-800">${stats.duplicates}</span>
          </div>
          <div class="bg-orange-50 p-2.5 rounded-lg border border-orange-200">
            <span class="text-xs text-orange-600 block">Missing Images</span>
            <span class="text-lg font-bold text-orange-800">${stats.missingImages}</span>
          </div>
          <div class="bg-red-50 p-2.5 rounded-lg border border-red-200">
            <span class="text-xs text-red-600 block">Parsing Errors</span>
            <span class="text-lg font-bold text-red-800">${stats.errors.length}</span>
          </div>
        </div>
      `;
    }

    const tableBody = document.getElementById('importPreviewTableBody');
    if (!tableBody) return;

    if (records.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-400">No file uploaded yet.</td></tr>';
      return;
    }

    tableBody.innerHTML = records.slice(0, 50).map((r, idx) => {
      const p = r.data;
      const warningHtml = r.warnings.length > 0 ? `<div class="text-[10px] text-amber-600">${r.warnings.join(', ')}</div>` : '';
      const hasImage = p.images && p.images.length > 0;

      return `
        <tr class="border-b border-gray-100 text-xs hover:bg-gray-50 ${!r.isValid ? 'bg-red-50/50' : ''}">
          <td class="p-2 text-center">
            <input type="checkbox" ${r.selected ? 'checked' : ''} onchange="window.ImportManager.toggleRecordSelection(${idx}, this.checked)">
          </td>
          <td class="p-2 font-mono">${window.CatalogCore.escapeHtml(p.barcode || '—')}</td>
          <td class="p-2">
            <span class="font-medium text-gray-800">${window.CatalogCore.escapeHtml(p.product_name)}</span>
            ${warningHtml}
          </td>
          <td class="p-2 text-gray-600">${window.CatalogCore.escapeHtml(p.brand || '—')}</td>
          <td class="p-2 text-gray-600">₹${p.selling_price || p.mrp || '0.00'}</td>
          <td class="p-2">
            ${hasImage ? `<span class="text-emerald-600 font-semibold">✓ (${p.images.length})</span>` : `<span class="text-amber-500">None</span>`}
          </td>
        </tr>
      `;
    }).join('');
  }

  async function handleExecuteImport() {
    const preservePrices = document.getElementById('importPreservePricesCheck').checked;
    const imageOnly = document.getElementById('importImageOnlyCheck').checked;

    const progressContainer = document.getElementById('importProgressContainer');
    const progressBar = document.getElementById('importProgressBar');
    const progressLabel = document.getElementById('importProgressLabel');

    if (progressContainer) progressContainer.classList.remove('hidden');

    try {
      const res = await window.ImportManager.executeImport({
        preserveExistingPrices: preservePrices,
        imageOnlyMode: imageOnly
      }, (current, total) => {
        const pct = Math.round((current / total) * 100);
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressLabel) progressLabel.textContent = `Processing ${current} of ${total} records (${pct}%)`;
      });

      showNotification(`Successfully imported ${res.importedCount} products into Local IndexedDB!`, 'success');
      updateCatalogStats();
      triggerSearch('');
    } catch (e) {
      alert(`Import error: ${e.message}`);
    } finally {
      if (progressContainer) progressContainer.classList.add('hidden');
    }
  }

  async function handleRollbackImport() {
    if (!confirm('Are you sure you want to rollback the last import batch?')) return;
    try {
      const res = await window.ImportManager.rollbackLastImport();
      showNotification(`Rollback successful! Restored catalog to ${res.restoredCount} products.`, 'info');
      updateCatalogStats();
      triggerSearch('');
    } catch (e) {
      alert(e.message);
    }
  }

  function handleExportErrors() {
    const csvContent = window.ImportManager.exportErrorReportCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `import_issues_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function updateCatalogStats() {
    const countBadge = document.getElementById('localCatalogCountBadge');
    if (!countBadge || !window.CatalogStorage) return;
    try {
      const all = await window.CatalogStorage.getAllProducts();
      countBadge.textContent = `${all.length} items`;
    } catch (e) {
      countBadge.textContent = '0 items';
    }
  }

  function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    const bg = type === 'success' ? 'bg-emerald-700' : (type === 'error' ? 'bg-red-700' : 'bg-gray-800');
    toast.className = `fixed bottom-4 right-4 z-50 text-white px-4 py-2.5 rounded-lg shadow-lg text-xs font-medium flex items-center gap-2 animate-fade-in ${bg}`;
    toast.innerHTML = `
      <svg class="w-4 h-4 fill-current" viewBox="0 0 20 20"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z"/></svg>
      <span>${window.CatalogCore.escapeHtml(message)}</span>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3500);
  }

  // Expose global controller
  window.GroceryApp = {
    triggerSearch,
    handleBarcodeLookup,
    openImagePickerForProduct,
    openProductEditor,
    handleSaveEditedProduct,
    selectForPos,
    switchTab
  };
})();
