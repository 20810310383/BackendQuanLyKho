const mongoose = require('mongoose');
const dotenv = require('dotenv');
const NguoiDung = require('../models/NguoiDung');
const connectDB = require('./connectDB');

// Tải biến môi trường
dotenv.config();

const seedUsers = async () => {
  try {
    // Kết nối database
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/quanlykho');
    console.log('Đang kết nối cơ sở dữ liệu để khởi tạo tài khoản...');

    // Xóa toàn bộ user hiện có để tránh dư thừa tài khoản
    await NguoiDung.deleteMany();
    console.log('Đã làm sạch bảng người dùng.');

    // Khởi tạo đúng 2 tài khoản Admin quản lý gốc
    const admins = [
      {
        tenDangNhap: 'admin1',
        matKhau: 'admin1@123', // Mật khẩu sẽ tự băm qua pre-save hook
        hoTen: 'Quản Lý Kho 1',
        vaiTro: 'admin'
      },
      {
        tenDangNhap: 'admin2',
        matKhau: 'admin2@123', // Mật khẩu sẽ tự băm qua pre-save hook
        hoTen: 'Quản Lý Kho 2',
        vaiTro: 'admin'
      }
    ];

    await NguoiDung.create(admins);
    console.log('==================================================');
    console.log('KHỞI TẠO TÀI KHOẢN THÀNH CÔNG!');
    console.log('Đã tạo đúng 02 tài khoản quản trị viên:');
    console.log('1. Tên đăng nhập: admin1 | Mật khẩu: admin1@123');
    console.log('2. Tên đăng nhập: admin2 | Mật khẩu: admin2@123');
    console.log('==================================================');

    process.exit(0);
  } catch (error) {
    console.error(`Lỗi trong quá trình khởi tạo dữ liệu: ${error.message}`);
    process.exit(1);
  }
};

seedUsers();
