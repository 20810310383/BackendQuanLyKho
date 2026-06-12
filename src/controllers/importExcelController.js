const XLSX = require('xlsx');
const SanPham = require('../models/SanPham');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// ──────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────

/**
 * Parse flexible price strings:
 *   "1.200.000"  → 1200000
 *   "1,2tr"      → 1200000
 *   "150k"       → 150000
 *   200000       → 200000 (number passthrough)
 */
const parsePriceString = (raw) => {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number') return Math.round(raw);

  const str = raw.toString().trim().toLowerCase();

  // Millions: "1.2 tr", "1,2tr", "2tr"
  const trMatch = str.match(/^([\d.,]+)\s*tr$/);
  if (trMatch) {
    const num = parseFloat(trMatch[1].replace(/\./g, '').replace(',', '.'));
    return Math.round(num * 1_000_000);
  }

  // Thousands: "150k", "150 k"
  const kMatch = str.match(/^([\d.,]+)\s*k$/);
  if (kMatch) {
    const num = parseFloat(kMatch[1].replace(/\./g, '').replace(',', '.'));
    return Math.round(num * 1_000);
  }

  // Plain number with dots-as-thousand-separators
  let cleaned = str.replace(/[^\d.,]/g, '');
  const dotCount = (cleaned.match(/\./g) || []).length;
  const commaCount = (cleaned.match(/,/g) || []).length;

  if (dotCount >= 2) {
    cleaned = cleaned.replace(/\./g, '');
  } else if (commaCount >= 2) {
    cleaned = cleaned.replace(/,/g, '');
  } else if (dotCount === 1 && commaCount === 0) {
    const [, frac] = cleaned.split('.');
    if (frac && frac.length === 3) cleaned = cleaned.replace('.', '');
  } else if (commaCount === 1 && dotCount === 0) {
    const [, frac] = cleaned.split(',');
    if (frac && frac.length === 3) cleaned = cleaned.replace(',', '');
    else cleaned = cleaned.replace(',', '.');
  } else if (dotCount === 1 && commaCount === 1) {
    if (cleaned.indexOf('.') < cleaned.indexOf(',')) {
      cleaned = cleaned.replace('.', '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(',', '');
    }
  }

  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : Math.round(result);
};

/**
 * Download a remote image URL and save it to the uploads directory.
 * Returns the local path string or '' on failure.
 */
const downloadRemoteImage = (imageUrl, imgDir) => {
  return new Promise((resolve) => {
    if (!imageUrl || !imageUrl.startsWith('http')) {
      resolve('');
      return;
    }
    try {
      // Strip query params before extracting extension
      const urlWithoutQuery = imageUrl.split('?')[0];
      const rawExt = urlWithoutQuery.split('.').pop().toLowerCase().replace(/[^a-z]/g, '');
      const VALID_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'];
      const ext = VALID_EXTS.includes(rawExt) ? rawExt : 'jpg';

      const filename = `import-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
      const filepath = path.join(imgDir, filename);
      const fileStream = fs.createWriteStream(filepath);
      const proto = imageUrl.startsWith('https') ? https : http;

      // Handle WriteStream errors to prevent unhandled 'error' event crash
      fileStream.on('error', () => {
        fs.unlink(filepath, () => {});
        resolve('');
      });

      const req = proto.get(imageUrl, { timeout: 8000 }, (response) => {
        if (response.statusCode !== 200) {
          fileStream.destroy();
          fs.unlink(filepath, () => {});
          resolve('');
          return;
        }
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(`/uploads/images/${filename}`);
        });
      });
      req.on('error', () => {
        fileStream.destroy();
        fs.unlink(filepath, () => {});
        resolve('');
      });
      req.on('timeout', () => {
        req.destroy();
        resolve('');
      });
    } catch {
      resolve('');
    }
  });
};

/**
 * Generate the next sequential SKU by checking the DB.
 */
const generateNextSKU = async () => {
  const latest = await SanPham.findOne({ maSKU: /^SP\d+$/ }).sort({ createdAt: -1 });
  let nextNum = 1;
  if (latest) {
    const m = latest.maSKU.match(/^SP(\d+)$/);
    if (m) nextNum = parseInt(m[1]) + 1;
  }
  return `SP${String(nextNum).padStart(6, '0')}`;
};

// Header aliases supported (case-insensitive)
const HEADER_MAP = {
  tenSanPham:  ['tên sản phẩm', 'ten san pham', 'tên', 'name', 'sản phẩm', 'san pham', 'product'],
  maSKU:       ['mã sku', 'ma sku', 'sku', 'mã hàng', 'ma hang', 'code'],
  giaNhap:     ['giá nhập', 'gia nhap', 'giá vốn', 'gia von', 'cost', 'nhập', 'nhap', 'giá mua', 'gia mua'],
  giaBan:      ['giá bán', 'gia ban', 'bán', 'ban', 'price', 'giá lẻ', 'gia le', 'bán lẻ', 'ban le'],
  donViTinh:   ['đvt', 'dvt', 'đơn vị tính', 'don vi tinh', 'đơn vị', 'don vi', 'unit'],
  moTa:        ['mô tả', 'mo ta', 'description', 'ghi chú', 'ghi chu', 'chi tiết', 'chi tiet', 'notes'],
  anhSanPham:  ['ảnh', 'anh', 'ảnh sản phẩm', 'anh san pham', 'image', 'url ảnh', 'url anh', 'image url', 'link ảnh', 'link anh'],
};

/**
 * Find which column in the sheet maps to which field
 * Returns { fieldName: columnLetter/index } mapping
 */
const resolveHeaders = (headerRow) => {
  const map = {}; // { fieldKey: colIndex }
  headerRow.forEach((cell, colIdx) => {
    if (!cell) return;
    const normalized = cell.toString().trim().toLowerCase();
    for (const [fieldKey, aliases] of Object.entries(HEADER_MAP)) {
      if (aliases.includes(normalized) && !(fieldKey in map)) {
        map[fieldKey] = colIdx;
      }
    }
  });
  return map;
};

// ──────────────────────────────────────────────────────────
//  Controller
// ──────────────────────────────────────────────────────────

/**
 * @desc    Import sản phẩm từ file Excel (.xlsx / .xls)
 * @route   POST /api/products/import-excel
 * @access  Private/Admin
 */
const importExcelProducts = async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Vui lòng tải lên file Excel (.xlsx hoặc .xls)');
  }

  // Ensure images directory exists (for downloaded remote images)
  const imgDir = path.join(__dirname, '../../public/uploads/images');
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  // Parse workbook from buffer
  let workbook;
  try {
    workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
  } catch (err) {
    res.status(400);
    throw new Error(`Không thể đọc file Excel: ${err.message}`);
  }

  // Use first sheet
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    res.status(400);
    throw new Error('File Excel không có sheet dữ liệu nào.');
  }

  // Convert sheet to 2D array (array of arrays)
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rows.length < 2) {
    res.status(400);
    throw new Error('File Excel không có dữ liệu (cần ít nhất 1 hàng tiêu đề + 1 hàng dữ liệu).');
  }

  // First row = headers
  const headerRow = rows[0].map(h => (h || '').toString());
  const colMap = resolveHeaders(headerRow);

  if (!('tenSanPham' in colMap)) {
    res.status(400);
    throw new Error('Không tìm thấy cột "Tên sản phẩm" trong file. Hãy kiểm tra lại dòng tiêu đề cột.');
  }

  const results = [];
  const warnings = [];

  // Pre-load all existing SKUs to avoid duplicates
  const allExistingSKUs = new Set(
    (await SanPham.find({}, 'maSKU').lean()).map(p => p.maSKU.toUpperCase())
  );

  // Process each data row
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];

    // Skip completely empty rows
    if (row.every(cell => cell === '' || cell === null || cell === undefined)) continue;

    const tenSanPham = (row[colMap.tenSanPham] ?? '').toString().trim();
    if (!tenSanPham) {
      warnings.push(`Hàng ${rowIdx + 1}: Bỏ qua vì thiếu tên sản phẩm.`);
      continue;
    }

    let maSKU = ('maSKU' in colMap ? (row[colMap.maSKU] ?? '') : '').toString().trim().toUpperCase();
    const giaNhapRaw = 'giaNhap' in colMap ? row[colMap.giaNhap] : '';
    const giaBanRaw  = 'giaBan'  in colMap ? row[colMap.giaBan]  : '';
    const donViTinh  = ('donViTinh' in colMap ? (row[colMap.donViTinh] ?? '') : '').toString().trim() || 'Cái';
    const moTa       = ('moTa' in colMap ? (row[colMap.moTa] ?? '') : '').toString().trim();
    const imageRaw   = ('anhSanPham' in colMap ? (row[colMap.anhSanPham] ?? '') : '').toString().trim();

    const giaNhap = parsePriceString(giaNhapRaw);
    const giaBan  = parsePriceString(giaBanRaw);

    // Handle SKU
    if (maSKU) {
      if (allExistingSKUs.has(maSKU)) {
        const autoSKU = await generateNextSKU();
        warnings.push(`Hàng ${rowIdx + 1} ("${tenSanPham}"): Mã SKU "${maSKU}" đã tồn tại — đã tự động sinh mã mới "${autoSKU}".`);
        maSKU = autoSKU;
      }
    } else {
      maSKU = await generateNextSKU();
      warnings.push(`Hàng ${rowIdx + 1} ("${tenSanPham}"): Không có mã SKU — đã tự động sinh mã "${maSKU}".`);
    }
    allExistingSKUs.add(maSKU);

    // Handle image: download if remote URL, or store path directly if local
    let anhSanPham = '';
    if (imageRaw.startsWith('http')) {
      anhSanPham = await downloadRemoteImage(imageRaw, imgDir);
      if (!anhSanPham) {
        warnings.push(`Hàng ${rowIdx + 1} ("${tenSanPham}"): Không thể tải ảnh từ URL — đã bỏ qua ảnh.`);
      }
    }

    // Save to database
    try {
      const newProduct = await SanPham.create({
        maSKU,
        tenSanPham,
        giaNhap,
        giaBan,
        donViTinh,
        anhSanPham,
        moTa,
        trangThai: true
      });

      if (req.io) {
        req.io.emit('product:change', { action: 'create', data: newProduct });
      }

      results.push({
        _id: newProduct._id,
        maSKU: newProduct.maSKU,
        tenSanPham: newProduct.tenSanPham,
        giaNhap: newProduct.giaNhap,
        giaBan: newProduct.giaBan,
        donViTinh: newProduct.donViTinh,
        anhSanPham: newProduct.anhSanPham,
      });
    } catch (createErr) {
      warnings.push(`Hàng ${rowIdx + 1} ("${tenSanPham}"): Lỗi lưu DB — ${createErr.message}`);
    }
  }

  res.json({
    success: true,
    message: `Nhập thành công ${results.length} sản phẩm từ file Excel.`,
    data: {
      imported: results.length,
      products: results,
      warnings
    }
  });
};

module.exports = { importExcelProducts };
