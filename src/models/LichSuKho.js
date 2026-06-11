const mongoose = require('mongoose');

const lichSuKhoSchema = new mongoose.Schema({
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
  soLuongThayDoi: {
    type: Number,
    required: true // Ví dụ +10 hoặc -3
  },
  loaiThayDoi: {
    type: String,
    enum: ['nhap_hang', 'ban_hang', 'tra_hang', 'dieu_chinh_thu_cong'],
    required: true
  },

  maThamChieu: {
    type: mongoose.Schema.Types.ObjectId,
    default: null // Liên kết tới DonHang hoặc NhapHang tương ứng
  },
  nguoiThucHien: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NguoiDung',
    required: true
  }
}, {
  timestamps: true
});

const LichSuKho = mongoose.model('LichSuKho', lichSuKhoSchema);

module.exports = LichSuKho;
