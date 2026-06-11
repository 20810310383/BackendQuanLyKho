const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  danhSachDonHang,
  chiTietDonHang,
  taoDonHang,
  traHang,
  capNhatTrangThaiDonHang
} = require('../controllers/orderController');

router.route('/')
  .get(protect, danhSachDonHang);

router.route('/checkout')
  .post(protect, taoDonHang);

router.route('/return/:id')
  .post(protect, traHang);

router.route('/:id')
  .get(protect, chiTietDonHang);

router.route('/:id/status')
  .put(protect, capNhatTrangThaiDonHang);

module.exports = router;
