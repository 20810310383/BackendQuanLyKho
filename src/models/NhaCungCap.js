const mongoose = require('mongoose');

const nhaCungCapSchema = new mongoose.Schema({
  maNhaCungCap: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  tenNhaCungCap: {
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
  noCanTra: {
    type: Number,
    default: 0
  },
  tongMua: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('NhaCungCap', nhaCungCapSchema);
