/**
 * js/pos-adapter.js
 * Integration contract for existing retail POS systems.
 * Provides ProductCatalogPicker API with events, callbacks, and Promise interfaces.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./catalog-core'),
      require('./catalog-search'),
      require('./storage')
    );
  } else {
    root.ProductCatalogPicker = factory(
      root.CatalogCore,
      root.CatalogSearch,
      root.CatalogStorage
    );
  }
}(typeof self !== 'undefined' ? self : this, function (CatalogCore, CatalogSearch, CatalogStorage) {
  'use strict';

  let currentOptions = {};
  let selectedProductsState = [];
  let isPickerOpen = false;

  /**
   * Opens the plugin interface in modal or embedded view
   */
  function open(options = {}) {
    currentOptions = {
      mode: 'select_single', // 'select_single' | 'select_multiple' | 'embed'
      onSelect: null,
      onClose: null,
      prefillBarcode: '',
      prefillQuery: '',
      targetForm: null, // DOM element or selector for auto-filling POS form
      ...options
    };

    isPickerOpen = true;

    // Show host modal/container if configured
    const pluginContainer = document.getElementById('posPluginContainer') || document.getElementById('catalogPickerApp');
    if (pluginContainer) {
      pluginContainer.classList.remove('hidden');
    }

    // Prefill query or barcode
    if (currentOptions.prefillBarcode) {
      const barcodeInput = document.getElementById('barcodeSearchInput');
      if (barcodeInput) {
        barcodeInput.value = currentOptions.prefillBarcode;
        window.GroceryApp && window.GroceryApp.handleBarcodeLookup(currentOptions.prefillBarcode);
      }
    } else if (currentOptions.prefillQuery) {
      const searchInput = document.getElementById('catalogSearchInput');
      if (searchInput) {
        searchInput.value = currentOptions.prefillQuery;
        window.GroceryApp && window.GroceryApp.triggerSearch(currentOptions.prefillQuery);
      }
    }

    return new Promise((resolve) => {
      // Store resolve for promise completion
      currentOptions._promiseResolve = resolve;
    });
  }

  /**
   * Closes picker and notifies host
   */
  function close() {
    isPickerOpen = false;
    const pluginContainer = document.getElementById('posPluginContainer');
    if (pluginContainer) {
      pluginContainer.classList.add('hidden');
    }
    if (typeof currentOptions.onClose === 'function') {
      currentOptions.onClose();
    }
  }

  /**
   * Programmatic search API for POS integration
   */
  async function search(query, options = {}) {
    return await CatalogSearch.search(query, options);
  }

  /**
   * Programmatic barcode lookup API
   */
  async function getProductByBarcode(barcode) {
    const res = await CatalogSearch.lookupBarcode(barcode);
    return res ? res.product : null;
  }

  /**
   * Returns currently selected products
   */
  function getSelectedProducts() {
    return [...selectedProductsState];
  }

  /**
   * Returns primary and gallery images for a productId
   */
  async function getSelectedImages(productId) {
    const p = await CatalogStorage.getProductById(productId);
    return p ? (p.images || []) : [];
  }

  /**
   * Host confirmation callback: hands selected product back to host POS
   * Safely maps to host form without clobbering tax/inventory
   */
  function confirmProductSelection(product) {
    selectedProductsState = [product];

    // If host supplied a target form selector, auto-populate standard fields
    if (currentOptions.targetForm) {
      populateHostForm(currentOptions.targetForm, product);
    }

    // Callback invocation
    if (typeof currentOptions.onSelect === 'function') {
      currentOptions.onSelect(product);
    }

    // Promise resolution
    if (typeof currentOptions._promiseResolve === 'function') {
      currentOptions._promiseResolve(product);
    }

    close();
  }

  /**
   * Safe helper to populate an existing POS product creation / edit form
   * Preserves retailer stock, cost price, tax rate, and HSN codes
   */
  function populateHostForm(formSelector, product) {
    const form = typeof formSelector === 'string' ? document.querySelector(formSelector) : formSelector;
    if (!form) return;

    const setField = (selector, val) => {
      const el = form.querySelector(selector);
      if (el && val !== undefined && val !== null) {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    setField('[name="barcode"], #barcode, #product_barcode', product.barcode);
    setField('[name="product_name"], #product_name, #itemName', product.product_name);
    setField('[name="brand"], #brand, #product_brand', product.brand);
    setField('[name="category"], #category, #product_category', product.category_id);
    setField('[name="mrp"], #mrp, #product_mrp', product.mrp);

    // Only update selling price if host field is currently empty
    const spField = form.querySelector('[name="selling_price"], #selling_price, #retail_price');
    if (spField && (!spField.value || parseFloat(spField.value) === 0)) {
      setField('[name="selling_price"], #selling_price, #retail_price', product.selling_price);
    }

    // Set primary image preview
    const primaryImg = (product.images || []).find(i => i.is_primary) || (product.images ? product.images[0] : null);
    if (primaryImg) {
      setField('[name="image_url"], #image_url, #product_image', primaryImg.image_url);
      const imgPreview = form.querySelector('#productImagePreview, .image-preview');
      if (imgPreview && imgPreview.tagName === 'IMG') {
        imgPreview.src = primaryImg.image_url;
      }
    }
  }

  return {
    open,
    close,
    search,
    getProductByBarcode,
    getSelectedProducts,
    getSelectedImages,
    confirmProductSelection,
    populateHostForm
  };
}));
