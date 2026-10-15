# Dataset Provenance and Licensing Documentation

## 1. Overview
The Grocery Product Image Picker & Catalog Importer strictly enforces provenance tracking, open-source attribution, and compliance with data and image licenses. It prevents copyright infringement by ensuring proprietary scraper assets (e.g. Blinkit, Zepto, Swiggy Instamart) are never downloaded or stored without brand authorization.

---

## 2. Supported Data Sources & Licences

### A. Open Food Facts
- **Database Licence:** [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
  - Under ODbL, metadata (product names, brands, categories, barcodes, ingredient lists) can be freely used, shared, and modified commercially, provided credit is given and derivative databases are shared under identical terms.
- **Image Licences:** Individual pack-shot photos are contributed by community members and are governed by:
  - **CC-BY-SA 3.0 / 4.0** (Creative Commons Attribution-ShareAlike)
  - Or **CC0 / Public Domain**
- **Attribution Requirement:**
  - Must state: *"Data and images sourced from Open Food Facts (world.openfoodfacts.org), contributed by community volunteers."*
  - Links to individual product pages must be retained.
- **API Guidelines followed:**
  - Standard User-Agent header supplied: `RetailPOSGroceryPicker/1.0 (retailpos@example.org)`.
  - Rate limiting of max 1 request/second strictly throttled in `js/providers/open-food-facts.js`.

---

### B. Synthetic Indian FMCG Sample Catalog (`sample-products.csv` & `sample-products.json`)
- **Licence:** Creative Commons Zero (CC0 1.0 Universal) / MIT
- **Content:** Synthetic Indian grocery entries (Tata Salt, Aashirvaad Atta, Maggi Masala Noodles, Amul Butter, Fortune Sunflower Oil, Parle-G, Tata Tea Gold, Surf Excel, Dettol Soap).
- **Images:** Pack-shot URLs reference public Open Food Facts CC-BY-SA pack-shots with author attribution preserved.

---

### C. Retailer-Owned & Kaggle Datasets (CSV / JSON)
- **Licence:** Determined by the uploading retailer or dataset creator.
- **Attribution:** When importing CSV files, the parser extracts `licence` and `attribution` columns. If unspecified, images are flagged as `Proprietary / Brand Authorized` (for store inventory display) or `Unknown` (unverified permissions restricted from automated external redistribution).
- **Kaggle Compliance:** Datasets downloaded manually by administrators must be reviewed for commercial-use flags (e.g. CC0, CC-BY, or Apache 2.0). Never hardcode Kaggle API keys in client JavaScript.

---

### D. Google Drive & Google Sheets Assets
- **Licence:** Internal proprietary distributor asset repository.
- **Usage:** Controlled directly by the retailer's authenticated Google account permissions.
