const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  danhSachNhapHang,
  chiTietNhapHang,
  taoDonNhap,
  huyDonNhap
} = require('../controllers/importController');

router.route('/')
  .get(protect, danhSachNhapHang)
  .post(protect, taoDonNhap);

router.route('/:id')
  .get(protect, chiTietNhapHang);

router.route('/:id/cancel')
  .put(protect, huyDonNhap);

module.exports = router;
