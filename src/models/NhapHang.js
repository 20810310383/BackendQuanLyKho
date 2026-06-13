const mongoose = require('mongoose');

const nhapHangSchema = new mongoose.Schema({
  maDonNhap: {
    type: String,
    required: true,
    unique: true
  },
  nhaCungCapId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NhaCungCap',
    default: null
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
    },
    giaBan: {
      type: Number,
      default: 0
    },
    giaSi: {
      type: Number,
      default: 0
    },
    giamGia: {
      type: Number,
      default: 0
    }
  }],
  tongTien: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  giamGiaPhieu: {
    type: Number,
    default: 0
  },
  chiPhiNhapNcc: {
    type: Number,
    default: 0
  },
  canTraNcc: {
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
  chiPhiNhapKhac: {
    type: Number,
    default: 0
  },
  maDatHangNhap: {
    type: String,
    default: ''
  },
  soHoaDonDauVao: {
    type: String,
    default: ''
  },
  trangThai: {
    type: String,
    enum: ['hoan_thanh', 'phieu_tam', 'da_huy'],
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
