/**
 * js/storage.js
 * IndexedDB operations, caching, transaction management, and offline support.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CatalogStorage = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DB_NAME = 'RetailPOS_GroceryCatalog_DB';
  const DB_VERSION = 1;

  let dbInstance = null;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (dbInstance) {
        return resolve(dbInstance);
      }
      if (typeof indexedDB === 'undefined') {
        return reject(new Error('IndexedDB is not supported in this environment'));
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function (event) {
        const db = event.target.result;

        // Products store
        if (!db.objectStoreNames.contains('products')) {
          const prodStore = db.createObjectStore('products', { keyPath: 'product_id' });
          prodStore.createIndex('barcode', 'barcode', { unique: false });
          prodStore.createIndex('brand', 'brand', { unique: false });
          prodStore.createIndex('category_id', 'category_id', { unique: false });
          prodStore.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // Cache store for external searches & queries
        if (!db.objectStoreNames.contains('search_cache')) {
          const cacheStore = db.createObjectStore('search_cache', { keyPath: 'cache_key' });
          cacheStore.createIndex('expiry', 'expiry', { unique: false });
        }

        // Settings / config store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = function (event) {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };

      request.onerror = function (event) {
        reject(event.target.error || new Error('Failed to open IndexedDB'));
      };
    });
  }

  async function getProductById(productId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('products', 'readonly');
      const store = tx.objectStore('products');
      const req = store.get(productId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function getProductByBarcode(barcode) {
    if (!barcode) return null;
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('products', 'readonly');
      const store = tx.objectStore('products');
      const index = store.index('barcode');
      const req = store.getAll ? index.getAll(String(barcode).trim()) : index.get(String(barcode).trim());
      req.onsuccess = () => {
        const res = req.result;
        if (Array.isArray(res)) {
          resolve(res.length > 0 ? res[0] : null);
        } else {
          resolve(res || null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function getAllProducts() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('products', 'readonly');
      const store = tx.objectStore('products');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveProduct(product) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('products', 'readwrite');
      const store = tx.objectStore('products');
      const req = store.put(product);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function bulkSaveProducts(productList) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('products', 'readwrite');
      const store = tx.objectStore('products');

      productList.forEach(item => {
        store.put(item);
      });

      tx.oncomplete = () => resolve({ count: productList.length, status: 'success' });
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
  }

  async function deleteProduct(productId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('products', 'readwrite');
      const store = tx.objectStore('products');
      const req = store.delete(productId);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function clearAllProducts() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('products', 'readwrite');
      const store = tx.objectStore('products');
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Cache Storage for External Queries ---
  async function getCache(key) {
    try {
      const db = await openDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction('search_cache', 'readonly');
        const store = tx.objectStore('search_cache');
        const req = store.get(key);
        req.onsuccess = () => {
          const entry = req.result;
          if (entry && entry.expiry > Date.now()) {
            resolve(entry.data);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  async function setCache(key, data, ttlMs = 300000) { // default 5 mins
    try {
      const db = await openDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction('search_cache', 'readwrite');
        const store = tx.objectStore('search_cache');
        const entry = {
          cache_key: key,
          data: data,
          expiry: Date.now() + ttlMs,
          created_at: Date.now()
        };
        store.put(entry);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) {
      return false;
    }
  }

  return {
    openDatabase,
    getProductById,
    getProductByBarcode,
    getAllProducts,
    saveProduct,
    bulkSaveProducts,
    deleteProduct,
    clearAllProducts,
    getCache,
    setCache
  };
}));
