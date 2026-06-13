const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  danhSachNhapHang,
  chiTietNhapHang,
  taoDonNhap,
  huyDonNhap,
  hoanThanhPhieuTam,
  capNhatNhapHang,
  capNhatGiaBanLeTrongPhieu
} = require('../controllers/importController');

router.route('/')
  .get(protect, danhSachNhapHang)
  .post(protect, taoDonNhap);

router.route('/:id')
  .get(protect, chiTietNhapHang)
  .put(protect, capNhatNhapHang);

router.route('/:id/update-retail-price')
  .put(protect, capNhatGiaBanLeTrongPhieu);

router.route('/:id/cancel')
  .put(protect, huyDonNhap);

router.route('/:id/complete')
  .put(protect, hoanThanhPhieuTam);

module.exports = router;
