const mongoose = require('mongoose');

const thuChiSchema = new mongoose.Schema({
  maGiaoDich: {
    type: String,
    required: true,
    unique: true
  },
  loaiGiaoDich: {
    type: String,
    enum: ['thu', 'chi'],
    required: true
  },
  danhMuc: {
    type: String,
    enum: [
      'ban_hang',      // Tự động thu từ đơn bán hàng
      'nhap_hang',     // Tự động chi cho đơn nhập hàng
      'thu_no',        // Thu nợ khách hàng (thủ công)
      'thu_khac',      // Thu khác (thủ công)
      'chi_mat_bang',  // Chi phí mặt bằng (thủ công)
      'chi_luong',     // Chi lương nhân viên (thủ công)
      'chi_dien_nuoc', // Chi điện nước (thủ công)
      'chi_khac'       // Chi khác (thủ công)
    ],
    required: true
  },
  soTien: {
    type: Number,
    required: true,
    min: 0
  },
  maThamChieu: {
    type: mongoose.Schema.Types.ObjectId,
    default: null // ID của DonHang hoặc NhapHang tương ứng nếu có
  },
  moTa: {
    type: String,
    default: '',
    trim: true
  },
  nguoiThucHien: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NguoiDung',
    required: true
  },
  ngayGiaoDich: {
    type: Date,
    default: Date.now,
    required: true
  }
}, {
  timestamps: true
});

const ThuChi = mongoose.model('ThuChi', thuChiSchema);

module.exports = ThuChi;
