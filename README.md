# Grocery Product Image Picker & Catalog Importer (POS Plugin)

A fast, zero-dependency, open-source grocery pack-shot image picker and catalog manager designed for Indian retail and quick-commerce POS systems. Built using pure vanilla JavaScript (ES6+), IndexedDB, and Tailwind CSS.

---

## 1. Features
- **Indian FMCG Catalog:** Ready for staples, atta, dals, edible oils, dairy, biscuits, noodles, tea, personal care, and household items.
- **Pack-shot Image Picker:** Multi-image modal preview, primary pack-shot designation, role tagging (front, back, ingredients, packaging), and image removal.
- **Provenance & Licensing:** Automated classification of CC-BY-SA, CC-BY, CC0, and Proprietary licenses. Includes downloadable attribution audit reports.
- **Debounced Search & Barcode Engine:** 350ms input debounce, cancellation of obsolete requests, stale response prevention, and leading-zero barcode preservation.
- **Physical USB Barcode Scanner Support:** Listens for rapid hardware keystrokes followed by `Enter` and performs instant exact matches.
- **Robust Bulk Importer:** RFC 4180 compliant CSV & JSON parser, column auto-detection, duplicate barcode warning, safe overwrite controls (protects retailer selling prices and operational POS data), progress bar, error export, and one-click rollback.
- **IndexedDB Local Storage:** Fast local queries with offline persistence and search result caching.
- **Modular Provider Architecture:**
  1. Local IndexedDB
  2. Indian FMCG Synthetic Dataset
  3. Open Food Facts API (ODbL 1.0 & CC-BY-SA 4.0 compliant)
  4. Custom CSV / JSON File Importer
  5. Google Drive Image Index (Optional)
  6. Google Apps Script / Google Sheets (Optional backend)
- **POS Adapter Integration:** Documented `ProductCatalogPicker` interface with Promise and callback contracts.

---

## 2. File Structure
```
├── index.html                   # Standalone demo, app, and POS simulator
├── styles.css                   # Quick-commerce UI styles & badge styles
├── providers.config.json        # Provider capability & endpoint configuration
├── sample-products.json         # Synthetic Indian FMCG sample data (JSON)
├── sample-products.csv          # Synthetic Indian FMCG sample data (CSV)
├── SOURCES.md                   # Provenance, licensing, and compliance terms
├── README.md                    # Documentation & setup guide
├── Code.gs                      # Optional Google Apps Script backend
├── js/
│   ├── catalog-core.js          # Canonical schema, normalization, barcode validation
│   ├── storage.js               # IndexedDB operations and caching
│   ├── licensing.js             # Image provenance, attribution & compliance checks
│   ├── catalog-search.js        # Multi-provider aggregator & debounced search
│   ├── image-picker.js          # Multi-image selection & primary designation modal
│   ├── import-manager.js        # CSV/JSON import, duplicate check, preview & rollback
│   ├── pos-adapter.js           # Integration contract for retail POS forms
│   ├── app.js                   # UI controller, event bindings & scanner listener
│   └── providers/
│       ├── open-food-facts.js   # Open Food Facts API client
│       ├── csv-provider.js      # CSV RFC 4180 parser & column mapper
│       ├── google-drive.js      # Google Drive image index adapter
│       └── google-sheets.js     # Google Sheets / Apps Script adapter
└── tests/
    └── index.html               # Runnable browser-based unit & integration test runner
```

---

## 3. How to Launch Without Node.js
This project requires **NO build tools, NO npm, and NO Node.js**.
You can launch it using any static file server:

### Option A: Python 3 Built-in HTTP Server
```bash
python3 -m http.server 8000
```
Then navigate to: `http://localhost:8000/index.html`

### Option B: PHP Built-in Server
```bash
php -S localhost:8000
```

### Option C: Ordinary Web Hosting or GitHub Pages
Upload all files to GitHub Pages, Netlify, Cloudflare Pages, cPanel, or Apache / Nginx docroot.

---

## 4. API Signups & Credentials
- **Local Catalog (IndexedDB):** No signup, works completely offline.
- **Sample FMCG Dataset:** No signup, built into the project.
- **Open Food Facts:** **No signup or API key required!** Open public API. Follows User-Agent and 1 req/sec guidelines.
- **Google Drive (Optional):** Requires a Google Cloud Console API Key only if querying Drive files directly via API v3. Mock mode enabled by default.
- **Google Sheets / Apps Script (Optional):** Requires deploying `Code.gs` as a Google Apps Script Web App. No external API keys needed.

---

## 5. How to Configure Open Food Facts
The Open Food Facts provider is active by default. You can configure country code, timeout, and custom User-Agent in `providers.config.json` or programmatically:
```javascript
window.OpenFoodFactsProvider.setConfig({
  country: 'in', // Priority country index
  userAgent: 'YourStoreNamePOS/1.0 (pos@yourstore.in)',
  rateLimitMs: 1000,
  timeoutMs: 6000
});
```

---

## 6. How to Import a Kaggle Grocery Dataset Manually
1. Download a grocery CSV (e.g., Indian FMCG, BigBasket, or Blinkit grocery exports) from Kaggle.
2. Open the **Bulk Import** tab in the app.
3. Select or drag-and-drop the `.csv` file.
4. The system automatically detects column headers (`barcode`, `product_name`, `brand`, `mrp`, `selling_price`, `image_url`).
5. Review the validation summary (duplicate barcodes, missing prices, missing images).
6. Enable **Preserve retailer selling prices** to ensure your store's existing margins are untouched.
7. Click **Commit Selected to DB**.

---

## 7. How to Connect Google Drive and Google Apps Script
### For Google Sheets:
1. Open Google Sheets and create a new sheet.
2. Click **Extensions &rarr; Apps Script**.
3. Copy the contents of `Code.gs` into the script editor.
4. Click **Deploy &rarr; New Deployment &rarr; Web app**.
5. Set *Execute as:* **Me**, and *Who has access:* **Anyone**.
6. Copy the deployed Web App URL and configure it in the plugin:
```javascript
window.GoogleSheetsProvider.setConfig({
  webAppUrl: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
  useMockMode: false
});
```

---

## 8. POS Integration Example
In your host POS application, include the script tags and call `ProductCatalogPicker.open()`:
```html
<button id="openPickerBtn">Select Grocery Item</button>

<script src="js/catalog-core.js"></script>
<script src="js/storage.js"></script>
<script src="js/catalog-search.js"></script>
<script src="js/pos-adapter.js"></script>

<script>
  document.getElementById('openPickerBtn').addEventListener('click', async () => {
    // Open picker and receive product metadata
    const selected = await window.ProductCatalogPicker.open({
      targetForm: '#myPosProductForm', // Auto-populates standard form fields
      onSelect: (product) => {
        console.log('Selected product:', product);
        // product.product_name, product.barcode, product.images, product.mrp
      }
    });
  });
</script>
```

---

## 9. Test Results & Verification
Open `tests/index.html` in any modern web browser to execute the test suite:
- [x] Barcode Normalization Preserves Leading Zeros
- [x] Barcode Checksum Verification (EAN-13 valid and invalid)
- [x] RFC 4180 CSV Parsing with Quoted Fields and Commas
- [x] Licence Engine: Classifies CC-BY-SA, CC0, and Unknown Licences
- [x] Canonical Product Schema Enforcement & Primary Image Fallback
- [x] Deduplicate & Merge: Preserves Retailer Price from Overwrite
- [x] IndexedDB Product Storage & Barcode Query
- [x] Debounce Search Handler Callback Execution
- [x] POS Adapter: Callback and Form Auto-Fill Integrity
- [x] Google Drive and Sheets Mock Provider Fallbacks

**Test Status: 10 / 10 tests passed.**
