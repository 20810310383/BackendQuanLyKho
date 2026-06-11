const jwt = require('jsonwebtoken');
const NguoiDung = require('../models/NguoiDung');

// Hàm tạo Access Token (hạn 15 phút)
const generateAccessToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '15m'
  });
};

// Hàm tạo Refresh Token (hạn 7 ngày)
const generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d'
  });
};

// Cấu hình cookie an toàn
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 15 * 60 * 1000 // 15 phút cho Access Token
};

const refreshCookieOptions = {
  ...cookieOptions,
  path: '/api/auth/refresh', // Chỉ gửi lên khi cần refresh
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 ngày cho Refresh Token
};

// @desc    Đăng nhập quản trị viên
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
  const { tenDangNhap, matKhau } = req.body;

  if (!tenDangNhap || !matKhau) {
    res.status(400);
    return next(new Error('Vui lòng nhập đầy đủ tài khoản và mật khẩu'));
  }

  try {
    const user = await NguoiDung.findOne({ tenDangNhap });

    if (user && (await user.soSanhMatKhau(matKhau))) {
      const accessToken = generateAccessToken(user._id);
      const refreshToken = generateRefreshToken(user._id);

      // Lưu token làm mới vào DB
      user.tokenLamMoi = refreshToken;
      await user.save();

      // Đính kèm tokens vào Http-Only Cookie
      res.cookie('accessToken', accessToken, cookieOptions);
      res.cookie('refreshToken', refreshToken, refreshCookieOptions);

      res.json({
        _id: user._id,
        tenDangNhap: user.tenDangNhap,
        hoTen: user.hoTen,
        vaiTro: user.vaiTro
      });
    } else {
      res.status(401);
      next(new Error('Tài khoản hoặc mật khẩu không chính xác'));
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Đăng xuất quản trị viên
// @route   POST /api/auth/logout
// @access  Private
const logout = async (req, res, next) => {
  try {
    const user = await NguoiDung.findById(req.user._id);
    if (user) {
      user.tokenLamMoi = null;
      await user.save();
    }

    // Xóa cookies ở client
    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', { ...refreshCookieOptions, path: '/api/auth/refresh' });

    res.json({ message: 'Đăng xuất thành công' });
  } catch (error) {
    next(error);
  }
};

// @desc    Làm mới Access Token (Refresh Token Rotation)
// @route   POST /api/auth/refresh
// @access  Public (Thông qua HttpOnly Cookie)
const refresh = async (req, res, next) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    res.status(401);
    return next(new Error('Không tìm thấy token làm mới, vui lòng đăng nhập lại'));
  }

  try {
    // Xác minh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Đối chiếu với user trong DB
    const user = await NguoiDung.findById(decoded.id);

    if (!user || user.tokenLamMoi !== refreshToken) {
      res.status(401);
      return next(new Error('Token làm mới không hợp lệ hoặc đã bị thu hồi'));
    }

    // Tạo bộ token mới (Token Rotation)
    const newAccessToken = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    // Lưu Refresh Token mới
    user.tokenLamMoi = newRefreshToken;
    await user.save();

    // Cập nhật lại cookies
    res.cookie('accessToken', newAccessToken, cookieOptions);
    res.cookie('refreshToken', newRefreshToken, refreshCookieOptions);

    res.json({ message: 'Làm mới token thành công' });
  } catch (error) {
    console.error('Lỗi khi refresh token:', error.message);
    res.status(401);
    next(new Error('Token làm mới đã hết hạn hoặc không hợp lệ, yêu cầu đăng nhập lại'));
  }
};

// @desc    Lấy thông tin tài khoản hiện tại
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  res.json({
    _id: req.user._id,
    tenDangNhap: req.user.tenDangNhap,
    hoTen: req.user.hoTen,
    vaiTro: req.user.vaiTro
  });
};

module.exports = { login, logout, refresh, getMe };
