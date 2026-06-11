const mongoose = require('mongoose');

const nhapHangSchema = new mongoose.Schema({
  maDonNhap: {
    type: String,
    required: true,
    unique: true
  },
  nhaCungCap: {
    type: String,
    required: true,
    trim: true
  },
  danhSachSanPham: [{
    sanPhamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SanPham',
      required: true
    },
    maSKU: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    tenSanPham: {
      type: String,
      required: true
    },
    soLuong: {
      type: Number,
      required: true,
      min: 1
    },
    donGiaNhap: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  tongTien: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  tienDaThanhToan: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  trangThai: {
    type: String,
    enum: ['hoan_thanh', 'da_huy'],
    default: 'hoan_thanh'
  },
  nguoiNhap: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NguoiDung',
    required: true
  },
  ghiChu: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

const NhapHang = mongoose.model('NhapHang', nhapHangSchema);

module.exports = NhapHang;
