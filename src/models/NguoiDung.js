const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const nguoiDungSchema = new mongoose.Schema({
  tenDangNhap: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  matKhau: {
    type: String,
    required: true
  },
  hoTen: {
    type: String,
    required: true
  },
  vaiTro: {
    type: String,
    enum: ['admin'],
    default: 'admin'
  },
  tokenLamMoi: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Tự động băm mật khẩu trước khi lưu
nguoiDungSchema.pre('save', async function (next) {
  if (!this.isModified('matKhau')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.matKhau = await bcrypt.hash(this.matKhau, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// So sánh đối chiếu mật khẩu
nguoiDungSchema.methods.soSanhMatKhau = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.matKhau);
};

const NguoiDung = mongoose.model('NguoiDung', nguoiDungSchema);

module.exports = NguoiDung;
