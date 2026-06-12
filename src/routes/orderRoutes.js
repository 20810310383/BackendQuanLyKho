const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  danhSachDonHang,
  chiTietDonHang,
  taoDonHang,
  traHang,
  capNhatTrangThaiDonHang,
  capNhatDonHang,
  xoaDonHang
} = require('../controllers/orderController');

router.route('/')
  .get(protect, danhSachDonHang);

router.route('/checkout')
  .post(protect, taoDonHang);

router.route('/return/:id')
  .post(protect, traHang);

router.route('/:id')
  .get(protect, chiTietDonHang)
  .put(protect, capNhatDonHang)
  .delete(protect, xoaDonHang);

router.route('/:id/status')
  .put(protect, capNhatTrangThaiDonHang);

module.exports = router;
