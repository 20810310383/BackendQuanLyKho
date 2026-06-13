const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, isAdmin } = require('../middlewares/authMiddleware');
const {
  danhSachSanPham,
  chiTietSanPham,
  taoSanPham,
  capNhatSanPham,
  xoaSanPham,
  dieuChinhTonKho,
  danhSachLoHangTonKho
} = require('../controllers/productController');
const { importExcelProducts } = require('../controllers/importExcelController');

// Multer memory storage for Excel import
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const validMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'application/octet-stream'  // some OS sends this for xlsx
    ];
    const validExts = ['.xlsx', '.xls'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    if (validMimes.includes(file.mimetype) || validExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file Excel (.xlsx hoặc .xls)'), false);
    }
  }
});

router.route('/')
  .get(protect, danhSachSanPham)
  .post(protect, isAdmin, taoSanPham);

router.post('/import-excel', protect, isAdmin, excelUpload.single('excelFile'), importExcelProducts);

router.get('/batches', protect, danhSachLoHangTonKho);

router.route('/:id')
  .get(protect, chiTietSanPham)
  .put(protect, isAdmin, capNhatSanPham)
  .delete(protect, isAdmin, xoaSanPham);

router.post('/:id/adjust-stock', protect, isAdmin, dieuChinhTonKho);

module.exports = router;

