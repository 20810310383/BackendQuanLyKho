const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  baoCaoXuatNhapTon,
  baoCaoDoanhThuNhanVien,
  baoCaoLoiNhuan
} = require('../controllers/reportController');

router.get('/inventory', protect, baoCaoXuatNhapTon);
router.get('/sales-by-cashier', protect, baoCaoDoanhThuNhanVien);
router.get('/profit', protect, baoCaoLoiNhuan);

module.exports = router;
