const express = require('express');
const router = express.Router();
const { protect, isAdmin } = require('../middlewares/authMiddleware');
const {
  danhSachThuChi,
  taoThuChiThuCong,
  xoaThuChi
} = require('../controllers/cashFlowController');

router.route('/')
  .get(protect, danhSachThuChi)
  .post(protect, taoThuChiThuCong);

router.route('/:id')
  .delete(protect, isAdmin, xoaThuChi);

module.exports = router;
