const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  danhSachNhaCungCap,
  chiTietNhaCungCap,
  taoNhaCungCap,
  capNhatNhaCungCap,
  xoaNhaCungCap
} = require('../controllers/supplierController');

router.route('/')
  .get(protect, danhSachNhaCungCap)
  .post(protect, taoNhaCungCap);

router.route('/:id')
  .get(protect, chiTietNhaCungCap)
  .put(protect, capNhatNhaCungCap)
  .delete(protect, xoaNhaCungCap);

module.exports = router;
