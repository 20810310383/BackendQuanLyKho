const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  danhSachKhachHang,
  chiTietKhachHang,
  taoKhachHang,
  capNhatKhachHang,
  xoaKhachHang
} = require('../controllers/customerController');

router.route('/')
  .get(protect, danhSachKhachHang)
  .post(protect, taoKhachHang);

router.route('/:id')
  .get(protect, chiTietKhachHang)
  .put(protect, capNhatKhachHang)
  .delete(protect, xoaKhachHang);

module.exports = router;
