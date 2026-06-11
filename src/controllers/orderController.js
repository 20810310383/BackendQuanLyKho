const DonHang = require('../models/DonHang');
const SanPham = require('../models/SanPham');
const LichSuKho = require('../models/LichSuKho');
const ThuChi = require('../models/ThuChi');

// Helper sinh mã đơn hàng tự động: HD-YYYYMMDD-XXXX
const generateMaDonHang = async () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const count = await DonHang.countDocuments({
    createdAt: { $gte: startOfDay }
  });
  return `HD-${dateStr}-${String(count + 1).padStart(4, '0')}`;
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

// @desc    Lấy danh sách đơn hàng (có phân trang, bộ lọc, tìm kiếm)
// @route   GET /api/orders
// @access  Private
const danhSachDonHang = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};

    // Tìm kiếm theo mã đơn hàng, tên khách hàng hoặc SĐT khách hàng
    if (req.query.search) {
      query.$or = [
        { maDonHang: { $regex: req.query.search, $options: 'i' } },
        { tenKhachHang: { $regex: req.query.search, $options: 'i' } },
        { soDienThoaiKhach: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Bộ lọc loại đơn hàng
    if (req.query.loaiDonHang) {
      query.loaiDonHang = req.query.loaiDonHang;
    }

    // Bộ lọc trạng thái đơn hàng
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

    const orders = await DonHang.find(query)
      .populate('nguoiBan', 'hoTen tenDangNhap vaiTro')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await DonHang.countDocuments(query);

    res.json({
      success: true,
      data: orders,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Lỗi lấy danh sách đơn hàng: ${error.message}`);
  }
};

// @desc    Lấy chi tiết 1 đơn hàng
// @route   GET /api/orders/:id
// @access  Private
const chiTietDonHang = async (req, res) => {
  try {
    const order = await DonHang.findById(req.params.id)
      .populate('nguoiBan', 'hoTen tenDangNhap vaiTro')
      .populate('danhSachSanPham.sanPhamId')
      .lean();

    if (!order) {
      res.status(404);
      throw new Error('Không tìm thấy đơn hàng');
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi lấy chi tiết đơn hàng');
  }
};

// @desc    Tạo đơn hàng mới (POS Checkout / Đặt hàng)
// @route   POST /api/orders/checkout
// @access  Private
const taoDonHang = async (req, res) => {
  try {
    const {
      tenKhachHang,
      soDienThoaiKhach,
      loaiDonHang,
      danhSachSanPham,
      tienGiamGia,
      tienDatCoc,
      tienDaThanhToan,
      ghiChu,
      trangThai
    } = req.body;

    if (!danhSachSanPham || danhSachSanPham.length === 0) {
      res.status(400);
      throw new Error('Đơn hàng phải có ít nhất một sản phẩm');
    }

    // Xác định trạng thái ban đầu của đơn hàng
    // Đơn trực tiếp (POS) mặc định là 'hoan_thanh', đơn đặt trước có thể là 'cho_xuly'
    const status = trangThai || (loaiDonHang === 'dat_hang' ? 'cho_xuly' : 'hoan_thanh');

    // 1. Kiểm tra tồn kho động và tính tổng tiền
    let tongTien = 0;
    const verifiedProducts = [];

    for (const item of danhSachSanPham) {
      const sp = await SanPham.findById(item.sanPhamId);
      if (!sp) {
        res.status(400);
        throw new Error(`Không tìm thấy sản phẩm ID: ${item.sanPhamId}`);
      }

      // Chỉ kiểm tra tồn kho nếu đơn hàng chuyển thẳng sang trạng thái có xuất kho (hoan_thanh hoặc dang_giao)
      if (status === 'hoan_thanh' || status === 'dang_giao') {
        const stockResult = await LichSuKho.aggregate([
          { $match: { sanPhamId: sp._id } },
          { $group: { _id: "$sanPhamId", tonKho: { $sum: "$soLuongThayDoi" } } }
        ]);

        const currentStock = stockResult.length > 0 ? stockResult[0].tonKho : 0;
        if (currentStock < item.soLuong) {
          res.status(400);
          throw new Error(`Sản phẩm "${sp.tenSanPham}" không đủ hàng tồn kho. (Tồn hiện tại: ${currentStock}, yêu cầu: ${item.soLuong})`);
        }
      }

      const itemTotal = sp.giaBan * item.soLuong;
      tongTien += itemTotal;

      verifiedProducts.push({
        sanPhamId: sp._id,
        maSKU: sp.maSKU,
        tenSanPham: sp.tenSanPham,
        soLuong: item.soLuong,
        donGia: sp.giaBan // Lưu giá bán tại thời điểm này
      });
    }

    const actualTienGiamGia = Number(tienGiamGia) || 0;
    const finalAmount = tongTien - actualTienGiamGia;

    // Sinh mã đơn hàng tự động
    const maDonHang = await generateMaDonHang();

    // 2. Tạo đơn hàng
    const order = await DonHang.create({
      maDonHang,
      tenKhachHang: tenKhachHang || 'Khách vãng lai',
      soDienThoaiKhach: soDienThoaiKhach || '',
      loaiDonHang: loaiDonHang || 'truc_tiep',
      danhSachSanPham: verifiedProducts,
      tongTien,
      tienGiamGia: actualTienGiamGia,
      tienDatCoc: Number(tienDatCoc) || 0,
      tienDaThanhToan: Number(tienDaThanhToan) || 0,
      trangThai: status,
      nguoiBan: req.user._id,
      ghiChu: ghiChu || ''
    });

    // 3. Nếu đơn hàng hoàn thành hoặc đang giao -> Trừ kho và tạo Dòng tiền thu
    if (status === 'hoan_thanh' || status === 'dang_giao') {
      // Ghi log biến động LichSuKho (soLuongThayDoi < 0)
      for (const item of verifiedProducts) {
        await LichSuKho.create({
          sanPhamId: item.sanPhamId,
          maSKU: item.maSKU,
          soLuongThayDoi: -item.soLuong,
          loaiThayDoi: 'ban_hang',
          maThamChieu: order._id,
          nguoiThucHien: req.user._id
        });
      }

      // Tạo Phiếu Thu dòng tiền loại 'ban_hang'
      if (order.tienDaThanhToan > 0) {
        const maGiaoDich = await generateMaGiaoDich('thu');
        await ThuChi.create({
          maGiaoDich,
          loaiGiaoDich: 'thu',
          danhMuc: 'ban_hang',
          soTien: order.tienDaThanhToan,
          maThamChieu: order._id,
          moTa: `Thu tiền đơn hàng ${order.maDonHang}`,
          nguoiThucHien: req.user._id
        });
      }
    } else {
      // Với đơn 'cho_xuly' (đặt trước), nếu khách có cọc tiền -> Ghi nhận dòng tiền đặt cọc
      if (order.tienDatCoc > 0) {
        const maGiaoDich = await generateMaGiaoDich('thu');
        await ThuChi.create({
          maGiaoDich,
          loaiGiaoDich: 'thu',
          danhMuc: 'ban_hang',
          soTien: order.tienDatCoc,
          maThamChieu: order._id,
          moTa: `Thu cọc đơn đặt hàng ${order.maDonHang}`,
          nguoiThucHien: req.user._id
        });
      }
    }

    // Phát tín hiệu socket real-time
    if (req.io) {
      req.io.emit('order:change', { action: 'create', data: order });
      if (status === 'hoan_thanh' || status === 'dang_giao') {
        req.io.emit('stock:change', { action: 'deduct', source: 'order', orderId: order._id });
      }
      req.io.emit('cashflow:change', { action: 'create', source: 'order' });
    }

    res.status(201).json({
      success: true,
      message: 'Tạo đơn hàng thành công',
      data: order
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi tạo đơn hàng');
  }
};

// @desc    Khách hàng trả hàng (Returns)
// @route   POST /api/orders/return/:id
// @access  Private
const traHang = async (req, res) => {
  try {
    const { sanPhamTraLai, tienHoanLai } = req.body;
    const order = await DonHang.findById(req.params.id);

    if (!order) {
      res.status(404);
      throw new Error('Không tìm thấy đơn hàng gốc');
    }

    if (order.trangThai !== 'hoan_thanh') {
      res.status(400);
      throw new Error('Chỉ được trả hàng cho đơn bán hàng đã hoàn thành');
    }

    if (!sanPhamTraLai || sanPhamTraLai.length === 0) {
      res.status(400);
      throw new Error('Vui lòng cung cấp danh sách sản phẩm trả lại');
    }

    // Khởi tạo chi tiết trả hàng nếu chưa có
    if (!order.chiTietTraHang) {
      order.chiTietTraHang = {
        ngayTra: null,
        tienHoanLai: 0,
        sanPhamTraLai: []
      };
    }

    // 1. Kiểm tra tính hợp lệ của số lượng hàng trả
    for (const item of sanPhamTraLai) {
      const itemGoc = order.danhSachSanPham.find(
        p => p.sanPhamId.toString() === item.sanPhamId.toString()
      );

      if (!itemGoc) {
        res.status(400);
        throw new Error(`Sản phẩm ID: ${item.sanPhamId} không nằm trong đơn hàng gốc`);
      }

      // Tính số lượng đã trả trước đó của sản phẩm này
      const daTraTruocDay = order.chiTietTraHang.sanPhamTraLai
        .filter(p => p.sanPhamId.toString() === item.sanPhamId.toString())
        .reduce((sum, p) => sum + p.soLuong, 0);

      if (daTraTruocDay + item.soLuong > itemGoc.soLuong) {
        res.status(400);
        throw new Error(
          `Số lượng trả của sản phẩm "${itemGoc.tenSanPham}" vượt quá số lượng đã mua. (Đã mua: ${itemGoc.soLuong}, Đã trả trước đây: ${daTraTruocDay}, Yêu cầu trả thêm: ${item.soLuong})`
        );
      }
    }

    // 2. Thực hiện cập nhật trả hàng
    const actualTienHoan = Number(tienHoanLai) || 0;
    order.chiTietTraHang.ngayTra = new Date();
    order.chiTietTraHang.tienHoanLai += actualTienHoan;

    for (const item of sanPhamTraLai) {
      // Thêm thông tin vào chi tiết sản phẩm trả lại
      const existingReturnItem = order.chiTietTraHang.sanPhamTraLai.find(
        p => p.sanPhamId.toString() === item.sanPhamId.toString()
      );

      if (existingReturnItem) {
        existingReturnItem.soLuong += item.soLuong;
      } else {
        order.chiTietTraHang.sanPhamTraLai.push({
          sanPhamId: item.sanPhamId,
          soLuong: item.soLuong
        });
      }

      // Ghi nhận nhập kho lại (LichSuKho, soLuongThayDoi > 0)
      const itemGoc = order.danhSachSanPham.find(p => p.sanPhamId.toString() === item.sanPhamId.toString());
      await LichSuKho.create({
        sanPhamId: item.sanPhamId,
        maSKU: itemGoc.maSKU,
        soLuongThayDoi: item.soLuong, // Cộng kho trở lại
        loaiThayDoi: 'tra_hang',
        maThamChieu: order._id,
        nguoiThucHien: req.user._id
      });
    }

    // Kiểm tra xem đơn hàng đã trả toàn bộ hay chưa
    let totalPurchased = order.danhSachSanPham.reduce((sum, p) => sum + p.soLuong, 0);
    let totalReturned = order.chiTietTraHang.sanPhamTraLai.reduce((sum, p) => sum + p.soLuong, 0);

    if (totalReturned === totalPurchased) {
      order.trangThai = 'da_tra';
    }

    await order.save();

    // 3. Tự động tạo Phiếu Chi dòng tiền (Hoàn lại tiền cho khách)
    if (actualTienHoan > 0) {
      const maGiaoDich = await generateMaGiaoDich('chi');
      await ThuChi.create({
        maGiaoDich,
        loaiGiaoDich: 'chi',
        danhMuc: 'chi_khac', // Hoàn tiền bán hàng quy vào chi khác/chi trả hàng
        soTien: actualTienHoan,
        maThamChieu: order._id,
        moTa: `Hoàn tiền trả hàng cho đơn ${order.maDonHang}`,
        nguoiThucHien: req.user._id
      });
    }

    // Phát tín hiệu real-time
    if (req.io) {
      req.io.emit('order:change', { action: 'return', data: order });
      req.io.emit('stock:change', { action: 'return', source: 'order', orderId: order._id });
      req.io.emit('cashflow:change', { action: 'create', source: 'order_return' });
    }

    res.json({
      success: true,
      message: 'Xử lý trả hàng thành công',
      data: order
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi xử lý trả hàng');
  }
};

// @desc    Cập nhật trạng thái đơn hàng (xử lý đặt trước -> hoàn thành)
// @route   PUT /api/orders/:id/status
// @access  Private
const capNhatTrangThaiDonHang = async (req, res) => {
  try {
    const { trangThai } = req.body;
    const order = await DonHang.findById(req.params.id);

    if (!order) {
      res.status(404);
      throw new Error('Không tìm thấy đơn hàng');
    }

    if (order.trangThai === 'hoan_thanh' || order.trangThai === 'da_tra') {
      res.status(400);
      throw new Error('Đơn hàng đã ở trạng thái hoàn thành hoặc đã trả hàng, không thể thay đổi trạng thái');
    }

    const previousStatus = order.trangThai;
    order.trangThai = trangThai;

    // Logic: Nếu chuyển đổi trạng thái từ 'cho_xuly' (đặt hàng trước) sang 'hoan_thanh' hoặc 'dang_giao'
    if (
      (previousStatus === 'cho_xuly') &&
      (trangThai === 'hoan_thanh' || trangThai === 'dang_giao')
    ) {
      // 1. Kiểm tra kho khả dụng trước khi trừ kho thực tế
      for (const item of order.danhSachSanPham) {
        const stockResult = await LichSuKho.aggregate([
          { $match: { sanPhamId: item.sanPhamId } },
          { $group: { _id: "$sanPhamId", tonKho: { $sum: "$soLuongThayDoi" } } }
        ]);

        const currentStock = stockResult.length > 0 ? stockResult[0].tonKho : 0;
        if (currentStock < item.soLuong) {
          res.status(400);
          throw new Error(`Sản phẩm SKU: ${item.maSKU} không đủ hàng tồn kho để xuất. (Tồn hiện tại: ${currentStock})`);
        }
      }

      // 2. Trừ kho
      for (const item of order.danhSachSanPham) {
        await LichSuKho.create({
          sanPhamId: item.sanPhamId,
          maSKU: item.maSKU,
          soLuongThayDoi: -item.soLuong,
          loaiThayDoi: 'ban_hang',
          maThamChieu: order._id,
          nguoiThucHien: req.user._id
        });
      }

      // 3. Thu phần tiền còn lại
      const remainingPayment = order.tienDaThanhToan - order.tienDatCoc;
      if (remainingPayment > 0) {
        const maGiaoDich = await generateMaGiaoDich('thu');
        await ThuChi.create({
          maGiaoDich,
          loaiGiaoDich: 'thu',
          danhMuc: 'ban_hang',
          soTien: remainingPayment,
          maThamChieu: order._id,
          moTa: `Thu tiền hoàn tất đơn hàng ${order.maDonHang}`,
          nguoiThucHien: req.user._id
        });
      }
    }

    await order.save();

    // Phát tín hiệu real-time
    if (req.io) {
      req.io.emit('order:change', { action: 'update_status', data: order });
      if (trangThai === 'hoan_thanh' || trangThai === 'dang_giao') {
        req.io.emit('stock:change', { action: 'deduct', source: 'order', orderId: order._id });
        req.io.emit('cashflow:change', { action: 'create', source: 'order_complete' });
      }
    }

    res.json({
      success: true,
      message: 'Cập nhật trạng thái đơn hàng thành công',
      data: order
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi cập nhật trạng thái đơn hàng');
  }
};

module.exports = {
  danhSachDonHang,
  chiTietDonHang,
  taoDonHang,
  traHang,
  capNhatTrangThaiDonHang
};
