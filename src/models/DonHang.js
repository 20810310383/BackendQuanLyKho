const mongoose = require('mongoose');

const donHangSchema = new mongoose.Schema({
  maDonHang: {
    type: String,
    required: true,
    unique: true
  },
  tenKhachHang: {
    type: String,
    default: 'Khách vãng lai',
    trim: true
  },
  soDienThoaiKhach: {
    type: String,
    default: '',
    trim: true
  },
  loaiDonHang: {
    type: String,
    enum: ['truc_tiep', 'dat_hang'],
    default: 'truc_tiep'
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
    donGia: {
      type: Number,
      required: true,
      min: 0 // Giá bán tại thời điểm mua lẻ
    }
  }],
  tongTien: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  tienGiamGia: {
    type: Number,
    min: 0,
    default: 0
  },
  tienDatCoc: {
    type: Number,
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
    enum: ['cho_xuly', 'dang_giao', 'hoan_thanh', 'da_tra'],
    default: 'hoan_thanh'
  },
  nguoiBan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NguoiDung',
    required: true
  },
  ghiChu: {
    type: String,
    default: ''
  },
  chiTietTraHang: {
    ngayTra: {
      type: Date,
      default: null
    },
    tienHoanLai: {
      type: Number,
      default: 0
    },
    sanPhamTraLai: [{
      sanPhamId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SanPham'
      },
      soLuong: {
        type: Number,
        min: 1
      }
    }]
  }
}, {
  timestamps: true
});

const DonHang = mongoose.model('DonHang', donHangSchema);

module.exports = DonHang;
