const NhapHang = require('../models/NhapHang');
const SanPham = require('../models/SanPham');
const LichSuKho = require('../models/LichSuKho');
const ThuChi = require('../models/ThuChi');
const NhaCungCap = require('../models/NhaCungCap');

// Helper sinh mã đơn nhập tự động: NH-YYYYMMDD-XXXX
const generateMaDonNhap = async () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = await NhapHang.countDocuments({
    maDonNhap: { $regex: new RegExp(`^NH-${dateStr}-`) }
  });
  return `NH-${dateStr}-${String(count + 1).padStart(4, '0')}`;
};

// Helper sinh mã đặt hàng nhập tự động: ĐHN-YYYYMMDD-XXXX
const generateMaDatHangNhap = async () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = await NhapHang.countDocuments({
    maDatHangNhap: { $regex: new RegExp(`^ĐHN-${dateStr}-`) }
  });
  return `ĐHN-${dateStr}-${String(count + 1).padStart(4, '0')}`;
};

// Helper sinh số hóa đơn đầu vào tự động: HĐ-YYYYMMDD-XXXX
const generateSoHoaDonDauVao = async () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = await NhapHang.countDocuments({
    soHoaDonDauVao: { $regex: new RegExp(`^HĐ-${dateStr}-`) }
  });
  return `HĐ-${dateStr}-${String(count + 1).padStart(4, '0')}`;
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

    // Tìm kiếm theo mã đơn nhập, tên nhà cung cấp, hoặc sản phẩm bên trong
    if (req.query.search) {
      const matchingSuppliers = await NhaCungCap.find({
        tenNhaCungCap: { $regex: req.query.search, $options: 'i' }
      }).select('_id');
      const supplierIds = matchingSuppliers.map(ncc => ncc._id);

      query.$or = [
        { maDonNhap: { $regex: req.query.search, $options: 'i' } },
        { nhaCungCapId: { $in: supplierIds } },
        { "danhSachSanPham.tenSanPham": { $regex: req.query.search, $options: 'i' } },
        { "danhSachSanPham.maSKU": { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Bộ lọc trạng thái đơn nhập
    if (req.query.trangThai) {
      query.trangThai = req.query.trangThai;
    }

    // Bộ lọc nhà cung cấp
    if (req.query.nhaCungCapId) {
      query.nhaCungCapId = req.query.nhaCungCapId;
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
      .populate('nhaCungCapId', 'tenNhaCungCap soDienThoai diaChi email')
      .populate('danhSachSanPham.sanPhamId', 'anhSanPham giaBan donViTinh')
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
      .populate('nhaCungCapId', 'tenNhaCungCap soDienThoai diaChi')
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
    const {
      nhaCungCapId,
      danhSachSanPham,
      tienDaThanhToan,
      ghiChu,
      giamGiaPhieu,
      chiPhiNhapNcc,
      canTraNcc,
      chiPhiNhapKhac,
      maDatHangNhap,
      soHoaDonDauVao,
      trangThai
    } = req.body;

    if (!nhaCungCapId) {
      res.status(400);
      throw new Error('Vui lòng chọn nhà cung cấp');
    }

    const ncc = await NhaCungCap.findById(nhaCungCapId);
    if (!ncc) {
      res.status(400);
      throw new Error('Không tìm thấy nhà cung cấp');
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

      const giamGiaItem = Number(item.giamGia) || 0;
      const giaBanItem = Number(item.giaBan) || sp.giaBan || 0;
      const giaSiItem = Number(item.giaSi) || sp.giaSi || 0;
      const itemTotal = (item.donGiaNhap - giamGiaItem) * item.soLuong;
      tongTien += itemTotal;

      verifiedProducts.push({
        sanPhamId: sp._id,
        maSKU: sp.maSKU,
        tenSanPham: sp.tenSanPham,
        soLuong: item.soLuong,
        donGiaNhap: item.donGiaNhap,
        giaBan: giaBanItem,
        giaSi: giaSiItem,
        giamGia: giamGiaItem
      });

      // CẬP NHẬT GIÁ NHẬP của sản phẩm nếu ở trạng thái hoàn thành
      if (trangThai === 'hoan_thanh') {
        sp.giaNhap = item.donGiaNhap;
        if (item.giaBan !== undefined) {
          sp.giaBan = item.giaBan;
        }
        if (item.giaSi !== undefined) {
          sp.giaSi = item.giaSi;
        }
        await sp.save();
      }
    }

    const maDonNhap = await generateMaDonNhap();
    const finalMaDatHangNhap = maDatHangNhap && maDatHangNhap.trim() ? maDatHangNhap.trim() : await generateMaDatHangNhap();
    const finalSoHoaDonDauVao = soHoaDonDauVao && soHoaDonDauVao.trim() ? soHoaDonDauVao.trim() : await generateSoHoaDonDauVao();
    const isHoanThanh = trangThai === 'hoan_thanh';

    // 2. Tạo đơn nhập hàng
    const importOrder = await NhapHang.create({
      maDonNhap,
      nhaCungCapId,
      danhSachSanPham: verifiedProducts,
      tongTien,
      giamGiaPhieu: Number(giamGiaPhieu) || 0,
      chiPhiNhapNcc: Number(chiPhiNhapNcc) || 0,
      canTraNcc: Number(canTraNcc) || 0,
      tienDaThanhToan: Number(tienDaThanhToan) || 0,
      chiPhiNhapKhac: Number(chiPhiNhapKhac) || 0,
      maDatHangNhap: finalMaDatHangNhap,
      soHoaDonDauVao: finalSoHoaDonDauVao,
      trangThai: trangThai || 'hoan_thanh',
      nguoiNhap: req.user._id,
      ghiChu: ghiChu || ''
    });

    if (isHoanThanh) {
      // Cập nhật nợ và doanh thu mua hàng của nhà cung cấp nếu có
      if (nhaCungCapId) {
        const ncc = await NhaCungCap.findById(nhaCungCapId);
        if (ncc) {
          ncc.tongMua += Number(canTraNcc) || 0;
          ncc.noCanTra += ((Number(canTraNcc) || 0) - (Number(tienDaThanhToan) || 0));
          await ncc.save();
        }
      }

      // 3. Ghi nhận tăng kho trong LichSuKho
      for (const item of verifiedProducts) {
        await LichSuKho.create({
          sanPhamId: item.sanPhamId,
          maSKU: item.maSKU,
          soLuongThayDoi: item.soLuong, // Cộng kho
          loaiThayDoi: 'nhap_hang',
          maThamChieu: importOrder._id,
          nhapHangId: importOrder._id,
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
    }

    // Phát tín hiệu real-time
    if (req.io) {
      req.io.emit('import:change', { action: 'create', data: importOrder });
      if (isHoanThanh) {
        req.io.emit('product:change', { action: 'update_cogs' });
        req.io.emit('stock:change', { action: 'import', source: 'import', importId: importOrder._id });
        req.io.emit('cashflow:change', { action: 'create', source: 'import' });
      }
    }

    res.status(201).json({
      success: true,
      message: isHoanThanh ? 'Tạo đơn nhập hàng thành công' : 'Lưu tạm đơn nhập hàng thành công',
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

    // Khấu trừ nợ và tổng mua của nhà cung cấp tương ứng
    if (importOrder.nhaCungCapId) {
      const ncc = await NhaCungCap.findById(importOrder.nhaCungCapId);
      if (ncc) {
        ncc.tongMua = Math.max(0, ncc.tongMua - importOrder.tongTien);
        const unpaid = importOrder.tongTien - importOrder.tienDaThanhToan;
        ncc.noCanTra = Math.max(0, ncc.noCanTra - unpaid);
        await ncc.save();
      }
    }

    // 3. Khấu trừ lại kho (LichSuKho với số lượng âm)
    for (const item of importOrder.danhSachSanPham) {
      await LichSuKho.create({
        sanPhamId: item.sanPhamId,
        maSKU: item.maSKU,
        soLuongThayDoi: -item.soLuong, // Trừ kho
        loaiThayDoi: 'dieu_chinh_thu_cong', // Phân loại điều chỉnh do hủy đơn nhập
        maThamChieu: importOrder._id,
        nhapHangId: importOrder._id,
        nguoiThucHien: req.user._id
      });
    }

    // 4. Tạo giao dịch thu hồi dòng tiền loại 'thu_khac'
    // Ghi nhận hủy vào thu chi nếu cần
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

// @desc    Hoàn thành đơn nhập hàng tạm (Phiếu tạm -> Hoàn thành, tăng kho, cập nhật nợ NCC, tạo phiếu chi)
// @route   PUT /api/imports/:id/complete
// @access  Private
const hoanThanhPhieuTam = async (req, res) => {
  try {
    const importOrder = await NhapHang.findById(req.params.id);

    if (!importOrder) {
      res.status(404);
      throw new Error('Không tìm thấy đơn nhập hàng');
    }

    if (importOrder.trangThai !== 'phieu_tam') {
      res.status(400);
      throw new Error('Chỉ có thể hoàn thành đơn nhập hàng đang ở trạng thái Phiếu tạm');
    }

    const { tienDaThanhToan, ghiChu } = req.body;

    if (tienDaThanhToan !== undefined) {
      importOrder.tienDaThanhToan = Number(tienDaThanhToan) || 0;
    }
    if (ghiChu !== undefined) {
      importOrder.ghiChu = ghiChu;
    }

    importOrder.trangThai = 'hoan_thanh';
    await importOrder.save();

    const canTraNcc = importOrder.canTraNcc || 0;
    const actualTienChi = importOrder.tienDaThanhToan || 0;
    const nhaCungCapId = importOrder.nhaCungCapId;

    // 1. Cập nhật nợ và doanh thu mua hàng của nhà cung cấp
    if (nhaCungCapId) {
      const ncc = await NhaCungCap.findById(nhaCungCapId);
      if (ncc) {
        ncc.tongMua += canTraNcc;
        ncc.noCanTra += (canTraNcc - actualTienChi);
        await ncc.save();
      }
    }

    // 2. Ghi nhận tăng kho và cập nhật giá nhập sản phẩm
    for (const item of importOrder.danhSachSanPham) {
      const sp = await SanPham.findById(item.sanPhamId);
      if (sp) {
        sp.giaNhap = item.donGiaNhap;
        if (item.giaBan !== undefined) {
          sp.giaBan = item.giaBan;
        }
        if (item.giaSi !== undefined) {
          sp.giaSi = item.giaSi;
        }
        await sp.save();
      }

      await LichSuKho.create({
        sanPhamId: item.sanPhamId,
        maSKU: item.maSKU,
        soLuongThayDoi: item.soLuong,
        loaiThayDoi: 'nhap_hang',
        maThamChieu: importOrder._id,
        nhapHangId: importOrder._id,
        nguoiThucHien: req.user._id
      });
    }

    // 3. Tạo Phiếu Chi dòng tiền
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
      req.io.emit('import:change', { action: 'complete', data: importOrder });
      req.io.emit('product:change', { action: 'update_cogs' });
      req.io.emit('stock:change', { action: 'import', source: 'import', importId: importOrder._id });
      req.io.emit('cashflow:change', { action: 'create', source: 'import' });
    }

    res.json({
      success: true,
      message: 'Hoàn thành đơn nhập hàng thành công',
      data: importOrder
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi hoàn thành đơn nhập hàng');
  }
};

// @desc    Cập nhật đơn nhập hàng
// @route   PUT /api/imports/:id
// @access  Private
const capNhatNhapHang = async (req, res) => {
  try {
    const importOrder = await NhapHang.findById(req.params.id);
    if (!importOrder) {
      res.status(404);
      throw new Error('Không tìm thấy đơn nhập hàng');
    }

    if (importOrder.trangThai === 'da_huy') {
      res.status(400);
      throw new Error('Không thể sửa đơn nhập hàng đã bị hủy');
    }

    const {
      nhaCungCapId,
      danhSachSanPham,
      tienDaThanhToan,
      ghiChu,
      giamGiaPhieu,
      chiPhiNhapNcc,
      canTraNcc,
      chiPhiNhapKhac,
      maDatHangNhap,
      soHoaDonDauVao,
      trangThai
    } = req.body;

    if (!nhaCungCapId) {
      res.status(400);
      throw new Error('Vui lòng chọn nhà cung cấp');
    }

    const ncc = await NhaCungCap.findById(nhaCungCapId);
    if (!ncc) {
      res.status(400);
      throw new Error('Không tìm thấy nhà cung cấp');
    }

    if (!danhSachSanPham || danhSachSanPham.length === 0) {
      res.status(400);
      throw new Error('Đơn nhập phải có ít nhất một sản phẩm');
    }

    const wasHoanThanh = importOrder.trangThai === 'hoan_thanh';
    const isHoanThanh = trangThai === 'hoan_thanh';

    // 1. Nếu đơn hàng cũ đã hoàn thành, ta cần hoàn trả lại các tác động cũ
    if (wasHoanThanh) {
      // Hoàn trả kho cũ (trừ kho)
      for (const item of importOrder.danhSachSanPham) {
        await LichSuKho.create({
          sanPhamId: item.sanPhamId,
          maSKU: item.maSKU,
          soLuongThayDoi: -item.soLuong,
          loaiThayDoi: 'dieu_chinh_thu_cong',
          maThamChieu: importOrder._id,
          nhapHangId: importOrder._id,
          nguoiThucHien: req.user._id
        });
      }

      // Hoàn trả nợ cũ và tổng mua cũ của nhà cung cấp cũ
      if (importOrder.nhaCungCapId) {
        const oldNcc = await NhaCungCap.findById(importOrder.nhaCungCapId);
        if (oldNcc) {
          oldNcc.tongMua = Math.max(0, oldNcc.tongMua - importOrder.canTraNcc);
          const unpaid = importOrder.canTraNcc - importOrder.tienDaThanhToan;
          oldNcc.noCanTra = Math.max(0, oldNcc.noCanTra - unpaid);
          await oldNcc.save();
        }
      }

      // Xóa giao dịch thu chi cũ
      await ThuChi.deleteMany({ maThamChieu: importOrder._id });
    }

    // 2. Tính toán chi phí đơn hàng mới và kiểm tra sản phẩm
    let newTongTien = 0;
    const verifiedProducts = [];

    for (const item of danhSachSanPham) {
      const sp = await SanPham.findById(item.sanPhamId);
      if (!sp) {
        res.status(400);
        throw new Error(`Không tìm thấy sản phẩm ID: ${item.sanPhamId}`);
      }

      const giamGiaItem = Number(item.giamGia) || 0;
      const giaBanItem = Number(item.giaBan) || sp.giaBan || 0;
      const giaSiItem = Number(item.giaSi) || sp.giaSi || 0;
      const itemTotal = (item.donGiaNhap - giamGiaItem) * item.soLuong;
      newTongTien += itemTotal;

      verifiedProducts.push({
        sanPhamId: sp._id,
        maSKU: sp.maSKU,
        tenSanPham: sp.tenSanPham,
        soLuong: item.soLuong,
        donGiaNhap: item.donGiaNhap,
        giaBan: giaBanItem,
        giaSi: giaSiItem,
        giamGia: giamGiaItem
      });

      // Cập nhật giá bán lẻ & giá nhập & giá sỉ nếu hoàn thành
      if (isHoanThanh) {
        sp.giaNhap = item.donGiaNhap;
        if (item.giaBan !== undefined) {
          sp.giaBan = item.giaBan;
        }
        if (item.giaSi !== undefined) {
          sp.giaSi = item.giaSi;
        }
        await sp.save();
      }
    }

    // 3. Cập nhật thông tin phiếu nhập
    importOrder.nhaCungCapId = nhaCungCapId;
    importOrder.danhSachSanPham = verifiedProducts;
    importOrder.tongTien = newTongTien;
    importOrder.giamGiaPhieu = Number(giamGiaPhieu) || 0;
    importOrder.chiPhiNhapNcc = Number(chiPhiNhapNcc) || 0;
    importOrder.canTraNcc = Number(canTraNcc) || 0;
    importOrder.tienDaThanhToan = Number(tienDaThanhToan) || 0;
    importOrder.chiPhiNhapKhac = Number(chiPhiNhapKhac) || 0;
    if (maDatHangNhap) importOrder.maDatHangNhap = maDatHangNhap;
    if (soHoaDonDauVao) importOrder.soHoaDonDauVao = soHoaDonDauVao;
    importOrder.trangThai = trangThai || importOrder.trangThai;
    importOrder.ghiChu = ghiChu || '';

    await importOrder.save();

    // 4. Áp dụng các tác động mới nếu hoàn thành
    if (isHoanThanh) {
      // Cộng kho mới
      for (const item of verifiedProducts) {
        await LichSuKho.create({
          sanPhamId: item.sanPhamId,
          maSKU: item.maSKU,
          soLuongThayDoi: item.soLuong,
          loaiThayDoi: 'nhap_hang',
          maThamChieu: importOrder._id,
          nhapHangId: importOrder._id,
          nguoiThucHien: req.user._id
        });
      }

      // Cập nhật nợ mới & tổng mua mới cho nhà cung cấp mới
      const newNcc = await NhaCungCap.findById(nhaCungCapId);
      if (newNcc) {
        newNcc.tongMua += Number(canTraNcc) || 0;
        newNcc.noCanTra += ((Number(canTraNcc) || 0) - (Number(tienDaThanhToan) || 0));
        await newNcc.save();
      }

      // Tạo phiếu chi mới
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
    }

    // Phát tín hiệu real-time
    if (req.io) {
      req.io.emit('import:change', { action: 'update', data: importOrder });
      req.io.emit('product:change', { action: 'update_cogs' });
      req.io.emit('stock:change', { action: 'import', source: 'import', importId: importOrder._id });
      req.io.emit('cashflow:change', { action: 'update', source: 'import' });
    }

    res.json({
      success: true,
      message: 'Cập nhật đơn nhập hàng thành công',
      data: importOrder
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi cập nhật đơn nhập hàng');
  }
};

const capNhatGiaBanLeTrongPhieu = async (req, res) => {
  try {
    const { id } = req.params;
    const { productId, giaBan } = req.body;

    if (!productId || giaBan === undefined) {
      res.status(400);
      throw new Error('Vui lòng cung cấp productId và giaBan');
    }

    const importOrder = await NhapHang.findById(id);
    if (!importOrder) {
      res.status(404);
      throw new Error('Không tìm thấy đơn nhập hàng');
    }

    if (importOrder.trangThai === 'da_huy') {
      res.status(400);
      throw new Error('Không thể cập nhật đơn nhập hàng đã bị hủy');
    }

    // Cập nhật giaBan trong danh sách sản phẩm của đơn nhập hàng
    let found = false;
    for (const item of importOrder.danhSachSanPham) {
      if (item.sanPhamId.toString() === productId.toString()) {
        item.giaBan = Number(giaBan);
        found = true;
      }
    }

    if (!found) {
      res.status(400);
      throw new Error('Sản phẩm không tồn tại trong đơn nhập này');
    }

    await importOrder.save();

    // Phát tín hiệu real-time
    if (req.io) {
      req.io.emit('import:change', { action: 'update_retail_price', data: importOrder });
    }

    res.json({
      success: true,
      message: 'Cập nhật giá bán lẻ trong đơn nhập hàng thành công',
      data: importOrder
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi cập nhật giá bán lẻ trong đơn nhập hàng');
  }
};

const capNhatGiaSiTrongPhieu = async (req, res) => {
  try {
    const { id } = req.params;
    const { productId, giaSi } = req.body;

    if (!productId || giaSi === undefined) {
      res.status(400);
      throw new Error('Vui lòng cung cấp productId và giaSi');
    }

    const importOrder = await NhapHang.findById(id);
    if (!importOrder) {
      res.status(404);
      throw new Error('Không tìm thấy đơn nhập hàng');
    }

    if (importOrder.trangThai === 'da_huy') {
      res.status(400);
      throw new Error('Không thể cập nhật đơn nhập hàng đã bị hủy');
    }

    // Cập nhật giaSi trong danh sách sản phẩm của đơn nhập hàng
    let found = false;
    for (const item of importOrder.danhSachSanPham) {
      if (item.sanPhamId.toString() === productId.toString()) {
        item.giaSi = Number(giaSi);
        found = true;
      }
    }

    if (!found) {
      res.status(400);
      throw new Error('Sản phẩm không tồn tại trong đơn nhập này');
    }

    await importOrder.save();

    // Phát tín hiệu real-time
    if (req.io) {
      req.io.emit('import:change', { action: 'update_wholesale_price', data: importOrder });
    }

    res.json({
      success: true,
      message: 'Cập nhật giá sỉ trong đơn nhập hàng thành công',
      data: importOrder
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi cập nhật giá sỉ trong đơn nhập hàng');
  }
};

module.exports = {
  danhSachNhapHang,
  chiTietNhapHang,
  taoDonNhap,
  huyDonNhap,
  hoanThanhPhieuTam,
  capNhatNhapHang,
  capNhatGiaBanLeTrongPhieu,
  capNhatGiaSiTrongPhieu
};

