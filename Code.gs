/**
 * Code.gs
 * Optional Google Apps Script backend for retail catalog and image index syncing.
 * Deploy as Web App ("Execute as me", "Who has access: Anyone").
 */

function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    var action = params.action || 'search';
    var sheet = getOrCreateCatalogSheet();
    var result = null;

    if (action === 'search') {
      var query = (params.query || '').toLowerCase().trim();
      result = searchRows(sheet, query);
    } else if (action === 'getByBarcode') {
      var barcode = (params.barcode || '').trim();
      result = getRowByBarcode(sheet, barcode);
    } else if (action === 'getAll') {
      result = getAllRows(sheet);
    } else {
      throw new Error('Unknown action: ' + action);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      data: result,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message || 'Apps Script execution failure'
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action || 'upsert';
    var sheet = getOrCreateCatalogSheet();

    if (action === 'upsert') {
      var count = upsertProducts(sheet, payload.products || []);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        recordsProcessed: count
      })).setMimeType(ContentService.MimeType.JSON);
    }

    throw new Error('Unsupported POST action');
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateCatalogSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Catalog');
  if (!sheet) {
    sheet = ss.insertSheet('Catalog');
    sheet.appendRow([
      'Barcode',
      'Product Name',
      'Brand',
      'Category',
      'MRP',
      'Selling Price',
      'Image URL',
      'Image Licence',
      'Last Updated'
    ]);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
  }
  return sheet;
}

function searchRows(sheet, query) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var results = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var barcode = String(row[0]);
    var name = String(row[1]);
    var brand = String(row[2]);

    if (!query || barcode.toLowerCase().indexOf(query) !== -1 ||
        name.toLowerCase().indexOf(query) !== -1 ||
        brand.toLowerCase().indexOf(query) !== -1) {
      results.push({
        barcode: barcode,
        product_name: name,
        brand: brand,
        category: row[3],
        mrp: row[4],
        selling_price: row[5],
        image_url: row[6],
        licence: row[7]
      });
    }
  }
  return results;
}

function getRowByBarcode(sheet, barcode) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === barcode) {
      return {
        barcode: String(data[i][0]),
        product_name: data[i][1],
        brand: data[i][2],
        category: data[i][3],
        mrp: data[i][4],
        selling_price: data[i][5],
        image_url: data[i][6],
        licence: data[i][7]
      };
    }
  }
  return null;
}

function getAllRows(sheet) {
  return searchRows(sheet, '');
}

function upsertProducts(sheet, products) {
  var data = sheet.getDataRange().getValues();
  var barcodeMap = {};
  for (var i = 1; i < data.length; i++) {
    barcodeMap[String(data[i][0])] = i + 1; // 1-based row index
  }

  var processed = 0;
  for (var j = 0; j < products.length; j++) {
    var p = products[j];
    var bCode = String(p.barcode || '');
    if (!bCode) continue;

    var rowValues = [
      bCode,
      p.product_name || '',
      p.brand || '',
      p.category_id || '',
      p.mrp || '',
      p.selling_price || '',
      (p.images && p.images[0]) ? p.images[0].image_url : '',
      (p.images && p.images[0]) ? p.images[0].licence : '',
      new Date().toISOString()
    ];

    if (barcodeMap[bCode]) {
      // update row
      sheet.getRange(barcodeMap[bCode], 1, 1, 9).setValues([rowValues]);
    } else {
      // append
      sheet.appendRow(rowValues);
      barcodeMap[bCode] = sheet.getLastRow();
    }
    processed++;
  }
  return processed;
}
