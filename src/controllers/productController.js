const SanPham = require('../models/SanPham');
const LichSuKho = require('../models/LichSuKho');

// @desc    Lấy danh sách sản phẩm (có phân trang, bộ lọc, tìm kiếm, tính tồn kho động)
// @route   GET /api/products
// @access  Private
const danhSachSanPham = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};

    // Tìm kiếm theo tên sản phẩm hoặc mã SKU
    if (req.query.search) {
      query.$or = [
        { tenSanPham: { $regex: req.query.search, $options: 'i' } },
        { maSKU: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Bộ lọc trạng thái hoạt động
    if (req.query.trangThai !== undefined) {
      query.trangThai = req.query.trangThai === 'true';
    }

    // Bộ lọc khoảng giá bán
    if (req.query.giaMin !== undefined || req.query.giaMax !== undefined) {
      const gMin = Number(req.query.giaMin);
      const gMax = Number(req.query.giaMax);
      const priceFilter = {};
      let hasFilter = false;

      if (req.query.giaMin !== undefined && req.query.giaMin !== '' && req.query.giaMin !== 'null' && !isNaN(gMin)) {
        priceFilter.$gte = gMin;
        hasFilter = true;
      }
      if (req.query.giaMax !== undefined && req.query.giaMax !== '' && req.query.giaMax !== 'null' && !isNaN(gMax)) {
        priceFilter.$lte = gMax;
        hasFilter = true;
      }

      if (hasFilter) {
        query.giaBan = priceFilter;
      }
    }

    // Lấy danh sách sản phẩm từ DB
    const sanPhams = await SanPham.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await SanPham.countDocuments(query);
    const totalActive = await SanPham.countDocuments({ trangThai: true });
    const totalInactive = await SanPham.countDocuments({ trangThai: false });

    // Tính toán tồn kho động cho các sản phẩm trong trang hiện tại
    const sanPhamIds = sanPhams.map(p => p._id);
    const rawStocks = await LichSuKho.aggregate([
      { $match: { sanPhamId: { $in: sanPhamIds } } },
      { $group: { _id: "$sanPhamId", tonKho: { $sum: "$soLuongThayDoi" } } }
    ]);

    const stockMap = {};
    rawStocks.forEach(item => {
      stockMap[item._id.toString()] = item.tonKho;
    });

    const sanPhamsWithStock = sanPhams.map(p => ({
      ...p,
      tonKho: stockMap[p._id.toString()] || 0
    }));

    res.json({
      success: true,
      data: sanPhamsWithStock,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        totalActive,
        totalInactive
      }
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Lỗi khi lấy danh sách sản phẩm: ${error.message}`);
  }
};

// @desc    Lấy thông tin chi tiết một sản phẩm (kèm tồn kho động)
// @route   GET /api/products/:id
// @access  Private
const chiTietSanPham = async (req, res) => {
  try {
    const sanPham = await SanPham.findById(req.params.id).lean();

    if (!sanPham) {
      res.status(404);
      throw new Error('Không tìm thấy sản phẩm');
    }

    // Tính tồn kho động của sản phẩm này
    const stockResult = await LichSuKho.aggregate([
      { $match: { sanPhamId: sanPham._id } },
      { $group: { _id: "$sanPhamId", tonKho: { $sum: "$soLuongThayDoi" } } }
    ]);

    const tonKho = stockResult.length > 0 ? stockResult[0].tonKho : 0;

    res.json({
      success: true,
      data: {
        ...sanPham,
        tonKho
      }
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi lấy chi tiết sản phẩm');
  }
};

// @desc    Tạo mới một sản phẩm
// @route   POST /api/products
// @access  Private/Admin
const taoSanPham = async (req, res) => {
  try {
    const { tenSanPham, giaNhap, giaBan, donViTinh, anhSanPham, moTa, trangThai } = req.body;

    if (!tenSanPham) {
      res.status(400);
      throw new Error('Vui lòng cung cấp tên sản phẩm');
    }

    // Tự sinh mã SKU theo định dạng SPxxxxxx
    const latestProduct = await SanPham.findOne({ maSKU: /^SP\d+$/ }).sort({ createdAt: -1 });
    let nextNumber = 1;
    if (latestProduct) {
      const match = latestProduct.maSKU.match(/^SP(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }
    const generatedSKU = `SP${String(nextNumber).padStart(6, '0')}`;

    const sanPham = await SanPham.create({
      maSKU: generatedSKU,
      tenSanPham,
      giaNhap: Number(giaNhap) || 0,
      giaBan: Number(giaBan) || 0,
      donViTinh: donViTinh || 'Cái',
      anhSanPham: anhSanPham || '',
      moTa: moTa || '',
      trangThai: trangThai !== undefined ? trangThai : true
    });

    // Phát tín hiệu real-time cập nhật danh mục sản phẩm
    if (req.io) {
      req.io.emit('product:change', { action: 'create', data: sanPham });
    }

    res.status(201).json({
      success: true,
      message: 'Tạo sản phẩm thành công',
      data: {
        ...sanPham.toObject(),
        tonKho: 0
      }
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi tạo sản phẩm');
  }
};

// @desc    Cập nhật thông tin một sản phẩm
// @route   PUT /api/products/:id
// @access  Private/Admin
const capNhatSanPham = async (req, res) => {
  try {
    const { maSKU, tenSanPham, giaNhap, giaBan, donViTinh, anhSanPham, moTa, trangThai } = req.body;

    const sanPham = await SanPham.findById(req.params.id);

    if (!sanPham) {
      res.status(404);
      throw new Error('Không tìm thấy sản phẩm');
    }

    // Nếu thay đổi SKU, kiểm tra trùng lặp
    if (maSKU && maSKU.toUpperCase() !== sanPham.maSKU) {
      const skuExists = await SanPham.findOne({ maSKU: maSKU.toUpperCase() });
      if (skuExists) {
        res.status(400);
        throw new Error('Mã SKU mới đã tồn tại trên hệ thống');
      }
      sanPham.maSKU = maSKU.toUpperCase();
    }

    if (tenSanPham !== undefined) sanPham.tenSanPham = tenSanPham;
    if (giaNhap !== undefined) sanPham.giaNhap = Number(giaNhap);
    if (giaBan !== undefined) sanPham.giaBan = Number(giaBan);
    if (donViTinh !== undefined) sanPham.donViTinh = donViTinh;
    if (anhSanPham !== undefined) sanPham.anhSanPham = anhSanPham;
    if (moTa !== undefined) sanPham.moTa = moTa;
    if (trangThai !== undefined) sanPham.trangThai = trangThai;

    const updatedSanPham = await sanPham.save();

    // Tính tồn kho động của sản phẩm để gửi socket đầy đủ dữ liệu
    const stockResult = await LichSuKho.aggregate([
      { $match: { sanPhamId: updatedSanPham._id } },
      { $group: { _id: "$sanPhamId", tonKho: { $sum: "$soLuongThayDoi" } } }
    ]);
    const tonKho = stockResult.length > 0 ? stockResult[0].tonKho : 0;

    const responseData = {
      ...updatedSanPham.toObject(),
      tonKho
    };

    // Phát tín hiệu real-time
    if (req.io) {
      req.io.emit('product:change', { action: 'update', data: responseData });
    }

    res.json({
      success: true,
      message: 'Cập nhật sản phẩm thành công',
      data: responseData
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi cập nhật sản phẩm');
  }
};

// @desc    Xóa một sản phẩm (Kiểm tra lịch sử giao dịch)
// @route   DELETE /api/products/:id
// @access  Private/Admin
const xoaSanPham = async (req, res) => {
  try {
    const sanPham = await SanPham.findById(req.params.id);

    if (!sanPham) {
      res.status(404);
      throw new Error('Không tìm thấy sản phẩm');
    }

    // Kiểm tra xem sản phẩm có lịch sử kho hay chưa
    const hasHistory = await LichSuKho.findOne({ sanPhamId: sanPham._id });

    if (hasHistory) {
      res.status(400);
      throw new Error('Sản phẩm đã phát sinh giao dịch nhập/xuất kho. Để tránh sai lệch số liệu, bạn không thể xóa cứng sản phẩm này. Hãy chuyển trạng thái sản phẩm sang ngưng hoạt động (trangThai = false).');
    }

    // Nếu chưa phát sinh lịch sử kho, cho phép xóa cứng
    await SanPham.findByIdAndDelete(req.params.id);

    // Phát tín hiệu real-time
    if (req.io) {
      req.io.emit('product:change', { action: 'delete', data: { _id: req.params.id } });
    }

    res.json({
      success: true,
      message: 'Xóa sản phẩm thành công'
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi xóa sản phẩm');
  }
};

module.exports = {
  danhSachSanPham,
  chiTietSanPham,
  taoSanPham,
  capNhatSanPham,
  xoaSanPham
};
