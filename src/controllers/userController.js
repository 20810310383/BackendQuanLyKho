const NguoiDung = require('../models/NguoiDung');

// @desc    Lấy danh sách tài khoản
// @route   GET /api/users
// @access  Private/Admin
const getUsers = async (req, res, next) => {
  try {
    const users = await NguoiDung.find().select('-matKhau');
    res.json(users);
  } catch (error) {
    next(error);
  }
};

// @desc    Tạo tài khoản quản trị viên mới
// @route   POST /api/users
// @access  Private/Admin
const createUser = async (req, res, next) => {
  const { tenDangNhap, matKhau, hoTen } = req.body;

  if (!tenDangNhap || !matKhau || !hoTen) {
    res.status(400);
    return next(new Error('Vui lòng điền đầy đủ các thông tin: Tài khoản, Mật khẩu và Họ tên'));
  }

  try {
    // Kiểm tra số lượng tài khoản hiện tại trong DB
    const userCount = await NguoiDung.countDocuments();
    if (userCount >= 2) {
      res.status(400);
      return next(new Error('Hệ thống chỉ giới hạn tối đa 02 tài khoản quản trị viên. Hãy xóa bớt tài khoản cũ để thêm mới.'));
    }

    // Kiểm tra tên đăng nhập trùng lặp
    const existUser = await NguoiDung.findOne({ tenDangNhap: tenDangNhap.toLowerCase() });
    if (existUser) {
      res.status(400);
      return next(new Error('Tên đăng nhập đã tồn tại trong hệ thống'));
    }

    const newUser = await NguoiDung.create({
      tenDangNhap,
      matKhau,
      hoTen,
      vaiTro: 'admin'
    });

    res.status(201).json({
      _id: newUser._id,
      tenDangNhap: newUser.tenDangNhap,
      hoTen: newUser.hoTen,
      vaiTro: newUser.vaiTro,
      anhDaiDien: newUser.anhDaiDien
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Cập nhật tài khoản quản trị viên khác
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = async (req, res, next) => {
  const { tenDangNhap, matKhau, hoTen } = req.body;
  const userId = req.params.id;

  try {
    const user = await NguoiDung.findById(userId);

    if (!user) {
      res.status(404);
      return next(new Error('Không tìm thấy tài khoản yêu cầu'));
    }

    // Nếu thay đổi tên đăng nhập, kiểm tra xem có trùng lặp với người khác không
    if (tenDangNhap && tenDangNhap.toLowerCase() !== user.tenDangNhap) {
      const existUser = await NguoiDung.findOne({ tenDangNhap: tenDangNhap.toLowerCase() });
      if (existUser) {
        res.status(400);
        return next(new Error('Tên đăng nhập đã tồn tại trong hệ thống'));
      }
      user.tenDangNhap = tenDangNhap;
    }

    if (hoTen) user.hoTen = hoTen;
    if (matKhau) user.matKhau = matKhau; // Mongoose pre-save hook will hash it

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      tenDangNhap: updatedUser.tenDangNhap,
      hoTen: updatedUser.hoTen,
      vaiTro: updatedUser.vaiTro,
      anhDaiDien: updatedUser.anhDaiDien
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Xóa tài khoản quản trị viên
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = async (req, res, next) => {
  const userId = req.params.id;

  // Chặn tự xóa chính mình
  if (userId === req.user._id.toString()) {
    res.status(400);
    return next(new Error('Không được phép tự xóa tài khoản của chính mình.'));
  }

  try {
    const user = await NguoiDung.findById(userId);

    if (!user) {
      res.status(404);
      return next(new Error('Không tìm thấy tài khoản cần xóa'));
    }

    await NguoiDung.findByIdAndDelete(userId);

    res.json({ success: true, message: 'Xóa tài khoản thành công.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getUsers, createUser, updateUser, deleteUser };
