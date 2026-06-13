const KhachHang = require('../models/KhachHang');

// @desc    Lấy danh sách khách hàng (phân trang, tìm kiếm)
// @route   GET /api/customers
// @access  Private
const danhSachKhachHang = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};

    if (req.query.search) {
      query.$or = [
        { maKhachHang: { $regex: req.query.search, $options: 'i' } },
        { tenKhachHang: { $regex: req.query.search, $options: 'i' } },
        { soDienThoai: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const customers = await KhachHang.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await KhachHang.countDocuments(query);

    res.json({
      success: true,
      data: customers,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Lỗi lấy danh sách khách hàng: ${error.message}`);
  }
};

// @desc    Chi tiết khách hàng
// @route   GET /api/customers/:id
// @access  Private
const chiTietKhachHang = async (req, res) => {
  try {
    const customer = await KhachHang.findById(req.params.id).lean();
    if (!customer) {
      res.status(404);
      throw new Error('Không tìm thấy khách hàng');
    }
    res.json({ success: true, data: customer });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi lấy chi tiết khách hàng');
  }
};

// @desc    Tạo mới khách hàng
// @route   POST /api/customers
// @access  Private
const taoKhachHang = async (req, res) => {
  try {
    const { maKhachHang, tenKhachHang, soDienThoai, email, diaChi } = req.body;

    if (!tenKhachHang) {
      res.status(400);
      throw new Error('Vui lòng cung cấp tên khách hàng');
    }

    let finalCode = maKhachHang ? maKhachHang.trim().toUpperCase() : '';

    if (!finalCode) {
      // Tự sinh mã khách hàng KH000001
      const latest = await KhachHang.findOne({ maKhachHang: /^KH\d+$/ }).sort({ createdAt: -1 });
      let nextNumber = 1;
      if (latest) {
        const match = latest.maKhachHang.match(/^KH(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }
      finalCode = `KH${String(nextNumber).padStart(6, '0')}`;
    } else {
      const codeExists = await KhachHang.findOne({ maKhachHang: finalCode });
      if (codeExists) {
        res.status(400);
        throw new Error('Mã khách hàng đã tồn tại');
      }
    }

    const customer = await KhachHang.create({
      maKhachHang: finalCode,
      tenKhachHang,
      soDienThoai: soDienThoai || '',
      email: email || '',
      diaChi: diaChi || '',
      noHienTai: 0,
      tongMuaHang: 0
    });

    res.status(201).json({
      success: true,
      message: 'Tạo khách hàng thành công',
      data: customer
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi tạo khách hàng');
  }
};

// @desc    Cập nhật khách hàng
// @route   PUT /api/customers/:id
// @access  Private
const capNhatKhachHang = async (req, res) => {
  try {
    const { maKhachHang, tenKhachHang, soDienThoai, email, diaChi, noHienTai, tongMuaHang } = req.body;
    const customer = await KhachHang.findById(req.params.id);

    if (!customer) {
      res.status(404);
      throw new Error('Không tìm thấy khách hàng');
    }

    if (maKhachHang && maKhachHang.trim().toUpperCase() !== customer.maKhachHang) {
      const codeExists = await KhachHang.findOne({ maKhachHang: maKhachHang.trim().toUpperCase() });
      if (codeExists) {
        res.status(400);
        throw new Error('Mã khách hàng đã tồn tại');
      }
      customer.maKhachHang = maKhachHang.trim().toUpperCase();
    }

    if (tenKhachHang !== undefined) customer.tenKhachHang = tenKhachHang;
    if (soDienThoai !== undefined) customer.soDienThoai = soDienThoai;
    if (email !== undefined) customer.email = email;
    if (diaChi !== undefined) customer.diaChi = diaChi;
    if (noHienTai !== undefined) customer.noHienTai = Number(noHienTai);
    if (tongMuaHang !== undefined) customer.tongMuaHang = Number(tongMuaHang);

    const updated = await customer.save();

    res.json({
      success: true,
      message: 'Cập nhật khách hàng thành công',
      data: updated
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi cập nhật khách hàng');
  }
};

// @desc    Xóa khách hàng
// @route   DELETE /api/customers/:id
// @access  Private
const xoaKhachHang = async (req, res) => {
  try {
    const customer = await KhachHang.findById(req.params.id);
    if (!customer) {
      res.status(404);
      throw new Error('Không tìm thấy khách hàng');
    }

    // Ở đây ta có thể kiểm tra xem khách hàng có đơn hàng nào không
    // Để giữ tính toàn vẹn dữ liệu
    await customer.deleteOne();

    res.json({
      success: true,
      message: 'Xóa khách hàng thành công'
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi xóa khách hàng');
  }
};

module.exports = {
  danhSachKhachHang,
  chiTietKhachHang,
  taoKhachHang,
  capNhatKhachHang,
  xoaKhachHang
};
