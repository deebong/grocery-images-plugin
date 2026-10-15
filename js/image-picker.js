/**
 * js/image-picker.js
 * Multi-image modal selection, primary image designation, URL validation, and role tagging.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./catalog-core'), require('./licensing'));
  } else {
    root.ImagePicker = factory(root.CatalogCore, root.LicensingEngine);
  }
}(typeof self !== 'undefined' ? self : this, function (CatalogCore, LicensingEngine) {
  'use strict';

  let currentProduct = null;
  let stagedImages = [];
  let onSaveCallback = null;

  /**
   * Initializes or updates the active modal state for a product
   */
  function openPicker(product, onSave) {
    currentProduct = JSON.parse(JSON.stringify(product)); // deep clone
    stagedImages = (currentProduct.images || []).map(img => CatalogCore.createCanonicalImage(img));
    onSaveCallback = onSave;

    renderModal();
  }

  function setPrimaryImage(imageId) {
    stagedImages.forEach(img => {
      img.is_primary = (img.image_id === imageId);
    });
    renderModal();
  }

  function removeImage(imageId) {
    stagedImages = stagedImages.filter(img => img.image_id !== imageId);
    if (stagedImages.length > 0 && !stagedImages.some(img => img.is_primary)) {
      stagedImages[0].is_primary = true;
    }
    renderModal();
  }

  function addCustomImageUrl(url, role = 'front', licence = 'Proprietary / Brand Authorized', attribution = 'Uploaded by Retailer') {
    if (!url || !/^(https?:\/\/|data:image\/)/i.test(url.trim())) {
      alert('Please enter a valid HTTP/HTTPS or data:image URL');
      return;
    }
    const newImg = CatalogCore.createCanonicalImage({
      image_id: CatalogCore.generateId('img_custom'),
      product_id: currentProduct ? currentProduct.product_id : '',
      image_url: url.trim(),
      thumbnail_url: url.trim(),
      image_role: role,
      is_primary: stagedImages.length === 0,
      source_id: 'custom_url',
      licence: licence,
      attribution: attribution
    });
    stagedImages.push(newImg);
    renderModal();
  }

  function updateImageRole(imageId, newRole) {
    const target = stagedImages.find(img => img.image_id === imageId);
    if (target) {
      target.image_role = newRole;
      renderModal();
    }
  }

  function saveChanges() {
    if (currentProduct) {
      currentProduct.images = stagedImages;
      if (typeof onSaveCallback === 'function') {
        onSaveCallback(currentProduct);
      }
    }
    closePicker();
  }

  function closePicker() {
    const modalEl = document.getElementById('imagePickerModal');
    if (modalEl) {
      modalEl.classList.add('hidden');
    }
    currentProduct = null;
    stagedImages = [];
  }

  function renderModal() {
    const modalEl = document.getElementById('imagePickerModal');
    if (!modalEl) return;

    modalEl.classList.remove('hidden');

    const titleEl = document.getElementById('pickerProductTitle');
    if (titleEl && currentProduct) {
      titleEl.textContent = `${currentProduct.product_name || 'Product'} (${currentProduct.barcode || 'No Barcode'})`;
    }

    const gridEl = document.getElementById('pickerImageGrid');
    if (!gridEl) return;

    if (stagedImages.length === 0) {
      gridEl.innerHTML = `
        <div class="col-span-full py-12 text-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <svg class="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
          <p class="font-medium text-gray-600">No images linked to this SKU</p>
          <p class="text-xs text-gray-400 mt-1">Add an image URL below or fetch from Open Food Facts</p>
        </div>
      `;
      return;
    }

    gridEl.innerHTML = stagedImages.map(img => {
      const licenceInfo = LicensingEngine ? LicensingEngine.inspectLicence(img.licence) : { name: img.licence || 'CC-BY-SA 4.0' };
      const isPrimary = img.is_primary;

      return `
        <div class="relative flex flex-col bg-white rounded-xl border ${isPrimary ? 'border-emerald-600 ring-2 ring-emerald-400 shadow-md' : 'border-gray-200 shadow-sm'} overflow-hidden transition-all group">
          <!-- Primary Badge -->
          ${isPrimary ? `
            <div class="absolute top-2 left-2 z-10 bg-emerald-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
              <svg class="w-3 h-3 fill-current" viewBox="0 0 20 20"><path d="M10 1l2.6 6.3 6.8.5-5.1 4.5 1.5 6.7L10 15.2l-5.8 3.8 1.5-6.7-5.1-4.5 6.8-.5L10 1z"/></svg> Primary Pack-shot
            </div>
          ` : ''}

          <!-- Image Preview -->
          <div class="h-44 bg-gray-50 flex items-center justify-center p-3 relative overflow-hidden border-b border-gray-100">
            <img src="${CatalogCore.escapeHtml(img.thumbnail_url || img.image_url)}"
                 alt="${CatalogCore.escapeHtml(img.image_role)}"
                 class="max-h-full max-w-full object-contain transition-transform group-hover:scale-105"
                 onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'120\\' height=\\'120\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%2394a3b8\\' stroke-width=\\'1.5\\'><rect width=\\'18\\' height=\\'18\\' x=\\'3\\' y=\\'3\\' rx=\\'2\\'/><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'/><path d=\\'m21 15-5-5L5 21\\'/></svg>';">
          </div>

          <!-- Controls & Metadata -->
          <div class="p-3 flex-1 flex flex-col justify-between text-xs space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Role:</label>
              <select onchange="window.ImagePicker.updateImageRole('${img.image_id}', this.value)" class="text-xs bg-gray-50 border border-gray-300 rounded px-2 py-1 font-medium focus:ring-1 focus:ring-emerald-500">
                <option value="front" ${img.image_role === 'front' ? 'selected' : ''}>Front Pack</option>
                <option value="back" ${img.image_role === 'back' ? 'selected' : ''}>Back / Nutrition</option>
                <option value="ingredients" ${img.image_role === 'ingredients' ? 'selected' : ''}>Ingredients</option>
                <option value="packaging" ${img.image_role === 'packaging' ? 'selected' : ''}>Packaging Angle</option>
                <option value="other" ${img.image_role === 'other' ? 'selected' : ''}>Other</option>
              </select>
            </div>

            <!-- Licence / Provenance -->
            <div class="bg-gray-50 p-2 rounded-lg text-[11px] border border-gray-100 text-gray-600">
              <div class="font-semibold text-gray-800 flex items-center justify-between">
                <span>Licence:</span>
                <span class="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-mono font-medium">${CatalogCore.escapeHtml(img.licence || 'CC-BY-SA 4.0')}</span>
              </div>
              <div class="truncate mt-1 text-gray-500" title="${CatalogCore.escapeHtml(img.attribution || '')}">
                Attribution: ${CatalogCore.escapeHtml(img.attribution || 'Open Food Facts')}
              </div>
              ${img.source_url ? `
                <a href="${CatalogCore.escapeHtml(img.source_url)}" target="_blank" rel="noopener" class="text-blue-600 hover:underline inline-block mt-0.5 truncate max-w-full">
                  Original Source &rarr;
                </a>
              ` : ''}
            </div>

            <!-- Action buttons -->
            <div class="flex items-center justify-between pt-1 border-t border-gray-100 gap-2">
              ${!isPrimary ? `
                <button type="button" onclick="window.ImagePicker.setPrimaryImage('${img.image_id}')" class="flex-1 py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-medium rounded-lg text-xs transition-colors">
                  Set as Primary
                </button>
              ` : `
                <span class="text-xs font-semibold text-emerald-700 py-1.5">Active Primary</span>
              `}
              <button type="button" onclick="window.ImagePicker.removeImage('${img.image_id}')" class="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition-colors" title="Remove image">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  return {
    openPicker,
    setPrimaryImage,
    removeImage,
    addCustomImageUrl,
    updateImageRole,
    saveChanges,
    closePicker
  };
}));
