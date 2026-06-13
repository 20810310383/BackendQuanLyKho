const mongoose = require('mongoose');

const khachHangSchema = new mongoose.Schema({
  maKhachHang: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  tenKhachHang: {
    type: String,
    required: true,
    trim: true
  },
  soDienThoai: {
    type: String,
    default: '',
    trim: true
  },
  email: {
    type: String,
    default: '',
    trim: true
  },
  diaChi: {
    type: String,
    default: '',
    trim: true
  },
  noHienTai: {
    type: Number,
    default: 0
  },
  tongMuaHang: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('KhachHang', khachHangSchema);
