const NhapHang = require('../models/NhapHang');
const SanPham = require('../models/SanPham');
const LichSuKho = require('../models/LichSuKho');
const ThuChi = require('../models/ThuChi');

// Helper sinh mã đơn nhập tự động: NH-YYYYMMDD-XXXX
const generateMaDonNhap = async () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const count = await NhapHang.countDocuments({
    createdAt: { $gte: startOfDay }
  });
  return `NH-${dateStr}-${String(count + 1).padStart(4, '0')}`;
};

// Helper sinh mã giao dịch Thu Chi tự động: PT/PC-YYYYMMDD-XXXX
const generateMaGiaoDich = async (loai) => {
  const prefix = loai === 'thu' ? 'PT' : 'PC';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const count = await ThuChi.countDocuments({
    maGiaoDich: { $regex: new RegExp(`^${prefix}-${dateStr}-`) }
  });
  return `${prefix}-${dateStr}-${String(count + 1).padStart(4, '0')}`;
};

// @desc    Lấy danh sách đơn nhập hàng (phân trang, bộ lọc, tìm kiếm)
// @route   GET /api/imports
// @access  Private
const danhSachNhapHang = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};

    // Tìm kiếm theo mã đơn nhập hoặc tên nhà cung cấp
    if (req.query.search) {
      query.$or = [
        { maDonNhap: { $regex: req.query.search, $options: 'i' } },
        { nhaCungCap: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Bộ lọc trạng thái đơn nhập
    if (req.query.trangThai) {
      query.trangThai = req.query.trangThai;
    }

    // Bộ lọc khoảng thời gian
    if (req.query.tuNgay || req.query.denNgay) {
      query.createdAt = {};
      if (req.query.tuNgay) {
        query.createdAt.$gte = new Date(req.query.tuNgay);
      }
      if (req.query.denNgay) {
        const endDate = new Date(req.query.denNgay);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    const imports = await NhapHang.find(query)
      .populate('nguoiNhap', 'hoTen tenDangNhap vaiTro')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await NhapHang.countDocuments(query);

    res.json({
      success: true,
      data: imports,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Lỗi lấy danh sách nhập hàng: ${error.message}`);
  }
};

// @desc    Chi tiết 1 đơn nhập hàng
// @route   GET /api/imports/:id
// @access  Private
const chiTietNhapHang = async (req, res) => {
  try {
    const importOrder = await NhapHang.findById(req.params.id)
      .populate('nguoiNhap', 'hoTen tenDangNhap vaiTro')
      .populate('danhSachSanPham.sanPhamId')
      .lean();

    if (!importOrder) {
      res.status(404);
      throw new Error('Không tìm thấy đơn nhập hàng');
    }

    res.json({
      success: true,
      data: importOrder
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi lấy chi tiết đơn nhập hàng');
  }
};

// @desc    Tạo đơn nhập hàng mới từ NCC (Tăng kho, Cập nhật giá nhập gốc, Tạo dòng tiền chi)
// @route   POST /api/imports
// @access  Private
const taoDonNhap = async (req, res) => {
  try {
    const { nhaCungCap, danhSachSanPham, tienDaThanhToan, ghiChu } = req.body;

    if (!nhaCungCap) {
      res.status(400);
      throw new Error('Vui lòng nhập tên nhà cung cấp');
    }

    if (!danhSachSanPham || danhSachSanPham.length === 0) {
      res.status(400);
      throw new Error('Đơn nhập phải có ít nhất một sản phẩm');
    }

    let tongTien = 0;
    const verifiedProducts = [];

    // 1. Kiểm tra sản phẩm và tính toán chi phí nhập
    for (const item of danhSachSanPham) {
      const sp = await SanPham.findById(item.sanPhamId);
      if (!sp) {
        res.status(400);
        throw new Error(`Không tìm thấy sản phẩm ID: ${item.sanPhamId}`);
      }

      const itemTotal = item.donGiaNhap * item.soLuong;
      tongTien += itemTotal;

      verifiedProducts.push({
        sanPhamId: sp._id,
        maSKU: sp.maSKU,
        tenSanPham: sp.tenSanPham,
        soLuong: item.soLuong,
        donGiaNhap: item.donGiaNhap
      });

      // CẬP NHẬT GIÁ NHẬP của sản phẩm trong danh mục (giaNhap) theo giá nhập đợt này
      sp.giaNhap = item.donGiaNhap;
      await sp.save();
    }

    const maDonNhap = await generateMaDonNhap();

    // 2. Tạo đơn nhập hàng
    const importOrder = await NhapHang.create({
      maDonNhap,
      nhaCungCap,
      danhSachSanPham: verifiedProducts,
      tongTien,
      tienDaThanhToan: Number(tienDaThanhToan) || 0,
      trangThai: 'hoan_thanh',
      nguoiNhap: req.user._id,
      ghiChu: ghiChu || ''
    });

    // 3. Ghi nhận tăng kho trong LichSuKho
    for (const item of verifiedProducts) {
      await LichSuKho.create({
        sanPhamId: item.sanPhamId,
        maSKU: item.maSKU,
        soLuongThayDoi: item.soLuong, // Cộng kho
        loaiThayDoi: 'nhap_hang',
        maThamChieu: importOrder._id,
        nguoiThucHien: req.user._id
      });
    }

    // 4. Tạo Phiếu Chi dòng tiền tự động loại 'nhap_hang'
    const actualTienChi = Number(tienDaThanhToan) || 0;
    if (actualTienChi > 0) {
      const maGiaoDich = await generateMaGiaoDich('chi');
      await ThuChi.create({
        maGiaoDich,
        loaiGiaoDich: 'chi',
        danhMuc: 'nhap_hang',
        soTien: actualTienChi,
        maThamChieu: importOrder._id,
        moTa: `Chi tiền nhập hàng đơn ${importOrder.maDonNhap}`,
        nguoiThucHien: req.user._id
      });
    }

    // Phát tín hiệu real-time
    if (req.io) {
      req.io.emit('import:change', { action: 'create', data: importOrder });
      req.io.emit('product:change', { action: 'update_cogs' });
      req.io.emit('stock:change', { action: 'import', source: 'import', importId: importOrder._id });
      req.io.emit('cashflow:change', { action: 'create', source: 'import' });
    }

    res.status(201).json({
      success: true,
      message: 'Tạo đơn nhập hàng thành công',
      data: importOrder
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi tạo đơn nhập hàng');
  }
};

// @desc    Hủy đơn nhập hàng (Hoàn trả lại kho âm, tạo dòng tiền thu hoàn hoặc hủy chi)
// @route   PUT /api/imports/:id/cancel
// @access  Private
const huyDonNhap = async (req, res) => {
  try {
    const importOrder = await NhapHang.findById(req.params.id);

    if (!importOrder) {
      res.status(404);
      throw new Error('Không tìm thấy đơn nhập hàng');
    }

    if (importOrder.trangThai === 'da_huy') {
      res.status(400);
      throw new Error('Đơn nhập hàng này đã ở trạng thái đã hủy trước đó');
    }

    // 1. Kiểm tra xem có đủ hàng tồn kho hiện tại để trừ đi phần hủy hay không
    // Tránh trường hợp đã nhập hàng -> bán hết -> rồi ấn hủy đơn nhập (gây âm kho vô lý)
    for (const item of importOrder.danhSachSanPham) {
      const stockResult = await LichSuKho.aggregate([
        { $match: { sanPhamId: item.sanPhamId } },
        { $group: { _id: "$sanPhamId", tonKho: { $sum: "$soLuongThayDoi" } } }
      ]);

      const currentStock = stockResult.length > 0 ? stockResult[0].tonKho : 0;
      if (currentStock < item.soLuong) {
        res.status(400);
        throw new Error(
          `Không thể hủy đơn nhập do sản phẩm "${item.tenSanPham}" đã xuất kho. Tồn hiện tại (${currentStock}) nhỏ hơn số lượng muốn hoàn trả (${item.soLuong}).`
        );
      }
    }

    // 2. Cập nhật trạng thái hủy
    importOrder.trangThai = 'da_huy';
    await importOrder.save();

    // 3. Khấu trừ lại kho (LichSuKho với số lượng âm)
    for (const item of importOrder.danhSachSanPham) {
      await LichSuKho.create({
        sanPhamId: item.sanPhamId,
        maSKU: item.maSKU,
        soLuongThayDoi: -item.soLuong, // Trừ kho
        loaiThayDoi: 'dieu_chinh_thu_cong', // Phân loại điều chỉnh do hủy đơn nhập
        maThamChieu: importOrder._id,
        nguoiThucHien: req.user._id
      });
    }

    // 4. Tạo giao dịch thu hồi dòng tiền loại 'thu_khac'
    if (importOrder.tienDaThanhToan > 0) {
      const maGiaoDich = await generateMaGiaoDich('thu');
      await ThuChi.create({
        maGiaoDich,
        loaiGiaoDich: 'thu',
        danhMuc: 'thu_khac',
        soTien: importOrder.tienDaThanhToan,
        maThamChieu: importOrder._id,
        moTa: `Thu hồi tiền do hủy đơn nhập ${importOrder.maDonNhap}`,
        nguoiThucHien: req.user._id
      });
    }

    // Phát tín hiệu real-time
    if (req.io) {
      req.io.emit('import:change', { action: 'cancel', data: importOrder });
      req.io.emit('stock:change', { action: 'cancel', source: 'import', importId: importOrder._id });
      req.io.emit('cashflow:change', { action: 'create', source: 'import_cancel' });
    }

    res.json({
      success: true,
      message: 'Hủy đơn nhập hàng thành công',
      data: importOrder
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi hủy đơn nhập hàng');
  }
};

module.exports = {
  danhSachNhapHang,
  chiTietNhapHang,
  taoDonNhap,
  huyDonNhap
};
