const mammoth = require('mammoth');
const SanPham = require('../models/SanPham');
const path = require('path');
const fs = require('fs');

// ──────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────

/**
 * Parse flexible price strings:
 *   "1.200.000"  → 1200000
 *   "1,200,000"  → 1200000
 *   "1.2 tr"     → 1200000
 *   "1,2tr"      → 1200000
 *   "150k"       → 150000
 *   "150 K"      → 150000
 *   "200000"     → 200000
 */
const parsePriceString = (raw) => {
  if (!raw) return 0;
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

  // Plain number with dots-as-thousand-separators: "1.200.000"
  // Distinguish from decimal separator: if there are ≥2 dots treat as thousands
  const dotCount = (str.match(/\./g) || []).length;
  const commaCount = (str.match(/,/g) || []).length;

  let cleaned = str.replace(/[^\d.,]/g, '');

  if (dotCount >= 2) {
    // e.g. 1.200.000 → remove dots
    cleaned = cleaned.replace(/\./g, '');
  } else if (commaCount >= 2) {
    // e.g. 1,200,000 → remove commas
    cleaned = cleaned.replace(/,/g, '');
  } else if (dotCount === 1 && commaCount === 0) {
    // Could be 1.200 (thousand separator) or 1.5 (decimal)
    const [, frac] = cleaned.split('.');
    if (frac && frac.length === 3) {
      // Thousand separator: 1.200 → 1200
      cleaned = cleaned.replace('.', '');
    }
    // else keep as decimal: 1.5
  } else if (commaCount === 1 && dotCount === 0) {
    // e.g. 1,200 → 1200 or decimal 1,5 → 1.5
    const [, frac] = cleaned.split(',');
    if (frac && frac.length === 3) {
      cleaned = cleaned.replace(',', '');
    } else {
      cleaned = cleaned.replace(',', '.');
    }
  } else if (dotCount === 1 && commaCount === 1) {
    // European: 1.200,50 or American: 1,200.50
    if (cleaned.indexOf('.') < cleaned.indexOf(',')) {
      // dot before comma → European → 1.200,50
      cleaned = cleaned.replace('.', '').replace(',', '.');
    } else {
      // comma before dot → American → 1,200.50
      cleaned = cleaned.replace(',', '');
    }
  }

  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : Math.round(result);
};

/**
 * Extract a field value from a block of plain text.
 * Matches lines like "Tên sản phẩm: Áo thun cổ tròn"
 */
const extractField = (text, ...labels) => {
  for (const label of labels) {
    const regex = new RegExp(`${label}\\s*[:\\-–]\\s*(.+)`, 'i');
    const match = text.match(regex);
    if (match) return match[1].trim();
  }
  return '';
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

// ──────────────────────────────────────────────────────────
//  Controller
// ──────────────────────────────────────────────────────────

/**
 * @desc    Import sản phẩm từ file Word (.docx)
 * @route   POST /api/products/import-word
 * @access  Private/Admin
 */
const importWordProducts = async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Vui lòng tải lên file Word (.docx)');
  }

  // Ensure images directory exists
  const imgDir = path.join(__dirname, '../../public/uploads/images');
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  // Track images extracted from docx — map from generated src → saved filename
  const extractedImages = {};
  let imageIndex = 0;

  const options = {
    convertImage: mammoth.images.imgElement(async (image) => {
      try {
        const imgBuffer = await image.read('buffer');
        const ext = (image.contentType || 'image/png').split('/')[1] || 'png';
        const filename = `import-${Date.now()}-${imageIndex++}.${ext}`;
        const filepath = path.join(imgDir, filename);
        fs.writeFileSync(filepath, imgBuffer);
        const url = `/uploads/images/${filename}`;
        extractedImages[url] = url;
        return { src: url };
      } catch {
        return { src: '' };
      }
    })
  };

  // Convert docx buffer to HTML
  let html = '';
  let plainText = '';
  try {
    const htmlResult = await mammoth.convertToHtml({ buffer: req.file.buffer }, options);
    html = htmlResult.value;

    const textResult = await mammoth.extractRawText({ buffer: req.file.buffer });
    plainText = textResult.value;
  } catch (err) {
    res.status(500);
    throw new Error(`Không thể đọc file Word: ${err.message}`);
  }

  // ── Split products ──────────────────────────────────────
  // Split by horizontal rules (<hr/>) in HTML or "---" / "***" / "===" in text
  let productBlocks = [];
  
  // Try splitting HTML by <hr> tags first
  const htmlBlocks = html.split(/<hr\s*\/?>/i).filter(b => b.trim().length > 0);
  
  if (htmlBlocks.length > 1) {
    // Use HTML blocks for image association, plain text for field extraction
    // We'll split plain text the same number of times using text markers
    productBlocks = htmlBlocks.map((htmlBlock) => {
      // Strip HTML tags to get plain text for this block
      const blockText = htmlBlock.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
      // Find images referenced in this HTML block
      const imgMatches = [...htmlBlock.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
      return { text: blockText, images: imgMatches };
    });
  } else {
    // Split by text separators in plain text
    const textBlocks = plainText.split(/\n\s*[-—=*]{3,}\s*\n/).filter(b => b.trim().length > 0);
    productBlocks = textBlocks.map(text => ({ text, images: [] }));
  }

  if (productBlocks.length === 0) {
    res.status(400);
    throw new Error('Không tìm thấy dữ liệu sản phẩm trong file. Hãy kiểm tra lại định dạng file.');
  }

  // ── Process each block ─────────────────────────────────
  const results = [];
  const warnings = [];
  const allExistingSKUs = new Set(
    (await SanPham.find({}, 'maSKU').lean()).map(p => p.maSKU.toUpperCase())
  );

  for (let i = 0; i < productBlocks.length; i++) {
    const { text, images } = productBlocks[i];
    if (!text.trim()) continue;

    // Extract fields
    const tenSanPham = extractField(text, 'Tên sản phẩm', 'Tên', 'Name', 'Sản phẩm');
    if (!tenSanPham) {
      warnings.push(`Khối ${i + 1}: Bỏ qua vì thiếu tên sản phẩm.`);
      continue;
    }

    let maSKU = extractField(text, 'Mã SKU', 'SKU', 'Mã', 'Mã hàng', 'Code');
    const giaNhapRaw = extractField(text, 'Giá nhập', 'Giá vốn', 'Nhập', 'Cost', 'Giá mua');
    const giaBanRaw = extractField(text, 'Giá bán', 'Bán', 'Price', 'Giá lẻ', 'Bán lẻ');
    const donViTinh = extractField(text, 'ĐVT', 'Đơn vị tính', 'Đơn vị', 'Unit') || 'Cái';
    const moTa = extractField(text, 'Mô tả', 'Description', 'Ghi chú', 'Chi tiết') || '';

    const giaNhap = parsePriceString(giaNhapRaw);
    const giaBan = parsePriceString(giaBanRaw);

    // Resolve image: use first image found in the block, or first extracted overall
    let anhSanPham = '';
    if (images && images.length > 0) {
      anhSanPham = images[0];
    }

    // Handle SKU
    if (maSKU) {
      maSKU = maSKU.toUpperCase();
      if (allExistingSKUs.has(maSKU)) {
        const autoSKU = await generateNextSKU();
        warnings.push(`Khối ${i + 1} ("${tenSanPham}"): Mã SKU "${maSKU}" đã tồn tại — đã tự động sinh mã mới "${autoSKU}".`);
        maSKU = autoSKU;
      }
    } else {
      maSKU = await generateNextSKU();
      warnings.push(`Khối ${i + 1} ("${tenSanPham}"): Không tìm thấy mã SKU — đã tự động sinh mã "${maSKU}".`);
    }

    // Mark this SKU as used so subsequent blocks in same import don't reuse it
    allExistingSKUs.add(maSKU);

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
        maSKU: newProduct.maSKU,
        tenSanPham: newProduct.tenSanPham,
        giaNhap: newProduct.giaNhap,
        giaBan: newProduct.giaBan,
        donViTinh: newProduct.donViTinh,
        anhSanPham: newProduct.anhSanPham,
        _id: newProduct._id
      });
    } catch (createErr) {
      warnings.push(`Khối ${i + 1} ("${tenSanPham}"): Lỗi lưu DB — ${createErr.message}`);
    }
  }

  res.json({
    success: true,
    message: `Nhập thành công ${results.length} sản phẩm từ file Word.`,
    data: {
      imported: results.length,
      products: results,
      warnings
    }
  });
};

module.exports = { importWordProducts };
