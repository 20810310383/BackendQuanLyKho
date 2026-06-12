const jwt = require('jsonwebtoken');
const NguoiDung = require('../models/NguoiDung');

const protect = async (req, res, next) => {
  let token;

  // Lấy token từ Authorization Header hoặc HTTP-Only Cookie
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    res.status(401);
    return next(new Error('Chưa đăng nhập, không có token truy cập'));
  }

  try {
    // Giải mã token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Gắn thông tin người dùng vào request (loại trừ trường mật khẩu)
    req.user = await NguoiDung.findById(decoded.id).select('-matKhau');

    if (!req.user) {
      res.status(401);
      return next(new Error('Tài khoản không tồn tại trên hệ thống'));
    }

    next();
  } catch (error) {
    console.error('Lỗi xác thực token:', error.message);
    res.status(401);
    
    if (error.name === 'TokenExpiredError') {
      return next(new Error('TokenExpired'));
    }
    
    next(new Error('Token không hợp lệ, yêu cầu đăng nhập lại'));
  }
};

const isAdmin = (req, res, next) => {
  if (req.user && req.user.vaiTro === 'admin') {
    next();
  } else {
    res.status(403);
    next(new Error('Quyền truy cập bị từ chối, chỉ dành cho quản trị viên'));
  }
};

module.exports = { protect, isAdmin };
