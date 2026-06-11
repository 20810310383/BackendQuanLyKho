const mongoose = require('mongoose');

const sanPhamSchema = new mongoose.Schema({
  maSKU: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  tenSanPham: {
    type: String,
    required: true,
    trim: true
  },
  giaNhap: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  giaBan: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  donViTinh: {
    type: String,
    required: true,
    default: 'Cái',
    trim: true
  },
  anhSanPham: {
    type: String,
    default: ''
  },
  moTa: {
    type: String,
    default: ''
  },
  trangThai: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const SanPham = mongoose.model('SanPham', sanPhamSchema);

module.exports = SanPham;
