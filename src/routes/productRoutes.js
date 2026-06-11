const express = require('express');
const router = express.Router();
const { protect, isAdmin } = require('../middlewares/authMiddleware');
const {
  danhSachSanPham,
  chiTietSanPham,
  taoSanPham,
  capNhatSanPham,
  xoaSanPham
} = require('../controllers/productController');

router.route('/')
  .get(protect, danhSachSanPham)
  .post(protect, isAdmin, taoSanPham);

router.route('/:id')
  .get(protect, chiTietSanPham)
  .put(protect, isAdmin, capNhatSanPham)
  .delete(protect, isAdmin, xoaSanPham);

module.exports = router;
