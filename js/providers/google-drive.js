/**
 * js/providers/google-drive.js
 * Google Drive Image Index Adapter
 * Handles Drive file IDs, generating preview/thumbnail URLs, and indexing image pack-shots.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../catalog-core'));
  } else {
    root.GoogleDriveProvider = factory(root.CatalogCore);
  }
}(typeof self !== 'undefined' ? self : this, function (CatalogCore) {
  'use strict';

  let config = {
    apiKey: '',
    folderId: '',
    useMockMode: true // Mock mode active until valid Google API Key is provided
  };

  // Mock catalog images for Drive testing
  const MOCK_DRIVE_INDEX = [
    {
      file_id: 'drive_file_tata_salt_01',
      barcode: '8901030383700',
      product_name: 'Tata Salt Vacuum Evaporated Iodised Salt',
      brand: 'Tata',
      role: 'front',
      category: 'Staples & Salt',
      web_view_link: 'https://drive.google.com/file/d/mock1/view',
      direct_url: 'https://images.openfoodfacts.org/images/products/890/103/038/3700/front_en.13.400.jpg',
      licence: 'Proprietary / Brand Authorized'
    },
    {
      file_id: 'drive_file_amul_butter_01',
      barcode: '8901030022357',
      product_name: 'Amul Butter Pasteurized Salted',
      brand: 'Amul',
      role: 'front',
      category: 'Dairy & Breakfast',
      web_view_link: 'https://drive.google.com/file/d/mock2/view',
      direct_url: 'https://images.openfoodfacts.org/images/products/890/103/002/2357/front_en.12.400.jpg',
      licence: 'Proprietary / Brand Authorized'
    }
  ];

  function setConfig(newConfig = {}) {
    config = { ...config, ...newConfig };
    if (config.apiKey && config.apiKey.length > 10) {
      config.useMockMode = false;
    }
  }

  /**
   * Transforms a Drive file ID into an embedding-safe image source URL
   * Warning: Requires public/read permissions on Google Drive file
   */
  function formatDriveImageUrl(fileId) {
    if (!fileId) return '';
    return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`;
  }

  function formatDriveThumbnailUrl(fileId, size = 200) {
    if (!fileId) return '';
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${size}`;
  }

  /**
   * Search image index
   */
  async function searchImages(query) {
    const q = String(query || '').toLowerCase().trim();

    if (config.useMockMode || !config.apiKey) {
      const filtered = MOCK_DRIVE_INDEX.filter(item =>
        item.product_name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.barcode.includes(q)
      );

      return filtered.map(item => CatalogCore.createCanonicalImage({
        image_id: `gdrive_${item.file_id}`,
        image_url: item.direct_url,
        thumbnail_url: item.direct_url,
        image_role: item.role,
        is_primary: true,
        source_id: 'google_drive',
        source_url: item.web_view_link,
        licence: item.licence,
        attribution: 'Internal Retailer Google Drive Asset Repository'
      }));
    }

    // Live Google Drive API v3 Files List
    try {
      const qParam = encodeURIComponent(`'${config.folderId}' in parents and mimeType contains 'image/' and fullText contains '${q}' and trashed = false`);
      const url = `https://www.googleapis.com/drive/v3/files?q=${qParam}&fields=files(id,name,thumbnailLink,webContentLink,webViewLink)&key=${config.apiKey}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Google Drive API error: ${res.status}`);
      }
      const data = await res.json();
      return (data.files || []).map(f => CatalogCore.createCanonicalImage({
        image_id: `gdrive_${f.id}`,
        image_url: formatDriveImageUrl(f.id),
        thumbnail_url: f.thumbnailLink || formatDriveThumbnailUrl(f.id),
        image_role: 'front',
        is_primary: true,
        source_id: 'google_drive',
        source_url: f.webViewLink,
        licence: 'Proprietary / Brand Authorized',
        attribution: `Drive File: ${f.name}`
      }));
    } catch (e) {
      console.warn('Google Drive search failed, falling back to mock:', e);
      return [];
    }
  }

  return {
    setConfig,
    formatDriveImageUrl,
    formatDriveThumbnailUrl,
    searchImages,
    getProviderInfo: () => ({
      id: 'google_drive',
      name: 'Google Drive Image Provider',
      isMock: config.useMockMode
    })
  };
}));
