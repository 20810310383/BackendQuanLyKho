const NhaCungCap = require('../models/NhaCungCap');

// @desc    Lấy danh sách nhà cung cấp (phân trang, tìm kiếm)
// @route   GET /api/suppliers
// @access  Private
const danhSachNhaCungCap = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};

    if (req.query.search) {
      query.$or = [
        { maNhaCungCap: { $regex: req.query.search, $options: 'i' } },
        { tenNhaCungCap: { $regex: req.query.search, $options: 'i' } },
        { soDienThoai: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const suppliers = await NhaCungCap.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await NhaCungCap.countDocuments(query);

    res.json({
      success: true,
      data: suppliers,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Lỗi lấy danh sách nhà cung cấp: ${error.message}`);
  }
};

// @desc    Chi tiết nhà cung cấp
// @route   GET /api/suppliers/:id
// @access  Private
const chiTietNhaCungCap = async (req, res) => {
  try {
    const supplier = await NhaCungCap.findById(req.params.id).lean();
    if (!supplier) {
      res.status(404);
      throw new Error('Không tìm thấy nhà cung cấp');
    }
    res.json({ success: true, data: supplier });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi lấy chi tiết nhà cung cấp');
  }
};

// @desc    Tạo mới nhà cung cấp
// @route   POST /api/suppliers
// @access  Private
const taoNhaCungCap = async (req, res) => {
  try {
    const { maNhaCungCap, tenNhaCungCap, soDienThoai, email, diaChi } = req.body;

    if (!tenNhaCungCap) {
      res.status(400);
      throw new Error('Vui lòng cung cấp tên nhà cung cấp');
    }

    let finalCode = maNhaCungCap ? maNhaCungCap.trim().toUpperCase() : '';

    if (!finalCode) {
      // Tự sinh mã nhà cung cấp NCC000001
      const latest = await NhaCungCap.findOne({ maNhaCungCap: /^NCC\d+$/ }).sort({ createdAt: -1 });
      let nextNumber = 1;
      if (latest) {
        const match = latest.maNhaCungCap.match(/^NCC(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }
      finalCode = `NCC${String(nextNumber).padStart(6, '0')}`;
    } else {
      const codeExists = await NhaCungCap.findOne({ maNhaCungCap: finalCode });
      if (codeExists) {
        res.status(400);
        throw new Error('Mã nhà cung cấp đã tồn tại');
      }
    }

    const supplier = await NhaCungCap.create({
      maNhaCungCap: finalCode,
      tenNhaCungCap,
      soDienThoai: soDienThoai || '',
      email: email || '',
      diaChi: diaChi || '',
      noCanTra: 0,
      tongMua: 0
    });

    res.status(201).json({
      success: true,
      message: 'Tạo nhà cung cấp thành công',
      data: supplier
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi tạo nhà cung cấp');
  }
};

// @desc    Cập nhật nhà cung cấp
// @route   PUT /api/suppliers/:id
// @access  Private
const capNhatNhaCungCap = async (req, res) => {
  try {
    const { maNhaCungCap, tenNhaCungCap, soDienThoai, email, diaChi, noCanTra, tongMua } = req.body;
    const supplier = await NhaCungCap.findById(req.params.id);

    if (!supplier) {
      res.status(404);
      throw new Error('Không tìm thấy nhà cung cấp');
    }

    if (maNhaCungCap && maNhaCungCap.trim().toUpperCase() !== supplier.maNhaCungCap) {
      const codeExists = await NhaCungCap.findOne({ maNhaCungCap: maNhaCungCap.trim().toUpperCase() });
      if (codeExists) {
        res.status(400);
        throw new Error('Mã nhà cung cấp đã tồn tại');
      }
      supplier.maNhaCungCap = maNhaCungCap.trim().toUpperCase();
    }

    if (tenNhaCungCap !== undefined) supplier.tenNhaCungCap = tenNhaCungCap;
    if (soDienThoai !== undefined) supplier.soDienThoai = soDienThoai;
    if (email !== undefined) supplier.email = email;
    if (diaChi !== undefined) supplier.diaChi = diaChi;
    if (noCanTra !== undefined) supplier.noCanTra = Number(noCanTra);
    if (tongMua !== undefined) supplier.tongMua = Number(tongMua);

    const updated = await supplier.save();

    res.json({
      success: true,
      message: 'Cập nhật nhà cung cấp thành công',
      data: updated
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi cập nhật nhà cung cấp');
  }
};

// @desc    Xóa nhà cung cấp
// @route   DELETE /api/suppliers/:id
// @access  Private
const xoaNhaCungCap = async (req, res) => {
  try {
    const supplier = await NhaCungCap.findById(req.params.id);
    if (!supplier) {
      res.status(404);
      throw new Error('Không tìm thấy nhà cung cấp');
    }

    await supplier.deleteOne();

    res.json({
      success: true,
      message: 'Xóa nhà cung cấp thành công'
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi xóa nhà cung cấp');
  }
};

module.exports = {
  danhSachNhaCungCap,
  chiTietNhaCungCap,
  taoNhaCungCap,
  capNhatNhaCungCap,
  xoaNhaCungCap
};
