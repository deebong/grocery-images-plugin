/**
 * js/licensing.js
 * Image provenance, licensing terms, attribution tracking, and compliance checks.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LicensingEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Recognized licence categories
  const LICENCE_PROFILES = {
    'CC0': {
      name: 'Creative Commons Zero (Public Domain)',
      canDisplay: true,
      canDownload: true,
      canRedistribute: true,
      requiresAttribution: false,
      shareAlike: false,
      badgeClass: 'badge-open',
      description: 'Free to use for any commercial or retail purpose without attribution.'
    },
    'CC-BY 4.0': {
      name: 'Creative Commons Attribution 4.0',
      canDisplay: true,
      canDownload: true,
      canRedistribute: true,
      requiresAttribution: true,
      shareAlike: false,
      badgeClass: 'badge-attribution',
      description: 'Commercial use permitted with author credit and link to licence.'
    },
    'CC-BY-SA 4.0': {
      name: 'Creative Commons Attribution-ShareAlike 4.0',
      canDisplay: true,
      canDownload: true,
      canRedistribute: true,
      requiresAttribution: true,
      shareAlike: true,
      badgeClass: 'badge-sharealike',
      description: 'Used by Open Food Facts. Requires attribution and sharing derivatives under same terms.'
    },
    'ODbL 1.0': {
      name: 'Open Database License 1.0 (Open Food Facts Database)',
      canDisplay: true,
      canDownload: true,
      canRedistribute: true,
      requiresAttribution: true,
      shareAlike: true,
      badgeClass: 'badge-sharealike',
      description: 'Applies to the structured Open Food Facts catalog records. Image pack-shots are governed by their respective individual CC licenses.'
    },
    'Proprietary / Brand Authorized': {
      name: 'Brand Pack-shot (Authorized FMCG Retail Listing)',
      canDisplay: true,
      canDownload: true,
      canRedistribute: false,
      requiresAttribution: false,
      shareAlike: false,
      badgeClass: 'badge-commercial',
      description: 'Official distributor / brand asset for retail POS display.'
    },
    'Unknown': {
      name: 'Unverified / Unknown Licence',
      canDisplay: true,
      canDownload: false,
      canRedistribute: false,
      requiresAttribution: false,
      shareAlike: false,
      badgeClass: 'badge-warning',
      description: 'Permissions unverified. Restricted from automated external publishing.'
    }
  };

  /**
   * Evaluates image licence metadata and returns safety assessment
   */
  function inspectLicence(licenceString) {
    if (!licenceString) return LICENCE_PROFILES['Unknown'];
    const norm = licenceString.trim().toUpperCase();

    if (norm.includes('CC0') || norm.includes('PUBLIC DOMAIN')) {
      return LICENCE_PROFILES['CC0'];
    }
    if (norm.includes('CC-BY-SA') || norm.includes('BY-SA')) {
      return LICENCE_PROFILES['CC-BY-SA 4.0'];
    }
    if (norm.includes('CC-BY') || norm.includes('ATTRIBUTION')) {
      return LICENCE_PROFILES['CC-BY 4.0'];
    }
    if (norm.includes('ODBL')) {
      return LICENCE_PROFILES['ODbL 1.0'];
    }
    if (norm.includes('BRAND') || norm.includes('PROPRIETARY') || norm.includes('RETAIL')) {
      return LICENCE_PROFILES['Proprietary / Brand Authorized'];
    }

    return {
      ...LICENCE_PROFILES['Unknown'],
      name: licenceString
    };
  }

  /**
   * Generates formatted HTML attribution snippet for a product's images
   */
  function formatAttributionHtml(product) {
    if (!product || !product.images || product.images.length === 0) {
      return '<span class="text-xs text-gray-500">No images linked</span>';
    }

    const attributions = product.images.map(img => {
      const profile = inspectLicence(img.licence);
      const attrText = img.attribution || 'Open Food Facts contributor';
      const srcUrl = img.source_url ? `<a href="${img.source_url}" target="_blank" rel="noopener" class="underline hover:text-emerald-700">source</a>` : '';
      return `
        <div class="text-xs py-1 border-b border-gray-100 last:border-0">
          <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${profile.badgeClass} mr-1">${img.licence || 'CC-BY-SA'}</span>
          <span class="font-medium text-gray-700">${attrText}</span>
          ${srcUrl ? ` (${srcUrl})` : ''}
        </div>
      `;
    });

    return attributions.join('');
  }

  /**
   * Generates an exportable CSV/JSON audit report of image licences
   */
  function generateLicenceReport(products) {
    const rows = [];
    products.forEach(p => {
      (p.images || []).forEach(img => {
        const info = inspectLicence(img.licence);
        rows.push({
          barcode: p.barcode,
          product_name: p.product_name,
          brand: p.brand,
          image_url: img.image_url,
          image_role: img.image_role,
          licence: img.licence,
          licence_type: info.name,
          requires_attribution: info.requiresAttribution,
          can_redistribute: info.canRedistribute,
          attribution: img.attribution || '',
          source_url: img.source_url || ''
        });
      });
    });
    return rows;
  }

  return {
    LICENCE_PROFILES,
    inspectLicence,
    formatAttributionHtml,
    generateLicenceReport
  };
}));
