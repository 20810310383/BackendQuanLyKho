const DonHang = require('../models/DonHang');
const SanPham = require('../models/SanPham');
const LichSuKho = require('../models/LichSuKho');
const ThuChi = require('../models/ThuChi');
const KhachHang = require('../models/KhachHang');
const NhapHang = require('../models/NhapHang');


// Helper sinh mã đơn hàng tự động: HD-YYYYMMDD-XXXX
const generateMaDonHang = async () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = await DonHang.countDocuments({
    maDonHang: { $regex: new RegExp(`^HD-${dateStr}-`) }
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

    // Bộ lọc khách hàng cụ thể
    if (req.query.khachHangId) {
      query.khachHangId = req.query.khachHangId;
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
      .populate({
        path: 'danhSachSanPham.sanPhamId',
        select: 'anhSanPham',
        model: 'SanPham'
      })
      .populate({
        path: 'danhSachSanPham.nhapHangId',
        select: 'maDonNhap',
        model: 'NhapHang'
      })
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
      .populate({
        path: 'danhSachSanPham.sanPhamId',
        model: 'SanPham'
      })
      .populate({
        path: 'danhSachSanPham.nhapHangId',
        select: 'maDonNhap',
        model: 'NhapHang'
      })
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
      khachHangId,
      tenKhachHang,
      soDienThoaiKhach,
      emailKhach,
      diaChiKhach,
      loaiDonHang,
      danhSachSanPham,
      tienGiamGia,
      tienDatCoc,
      tienDaThanhToan,
      ghiChu,
      trangThai,
      loaiGia
    } = req.body;

    if (!danhSachSanPham || danhSachSanPham.length === 0) {
      res.status(400);
      throw new Error('Đơn hàng phải có ít nhất một sản phẩm');
    }

    // 1. Kiểm tra tồn kho động và tính tổng tiền theo từng lô hàng
    let tongTien = 0;
    const verifiedProducts = [];

    // Xác định trạng thái ban đầu để kiểm tra tồn kho
    const initialStatus = trangThai || (loaiDonHang === 'dat_hang' ? 'cho_xuly' : 'hoan_thanh');
    const isDeductStock = initialStatus === 'hoan_thanh' || initialStatus === 'dang_giao' || initialStatus === 'con_no';

    for (const item of danhSachSanPham) {
      const sp = await SanPham.findById(item.sanPhamId);
      if (!sp) {
        res.status(400);
        throw new Error(`Không tìm thấy sản phẩm ID: ${item.sanPhamId}`);
      }

      if (!item.nhapHangId) {
        res.status(400);
        throw new Error(`Sản phẩm "${sp.tenSanPham}" chưa chọn lô hàng nhập kho để bán`);
      }

      const impSlip = await NhapHang.findById(item.nhapHangId);
      if (!impSlip) {
        res.status(400);
        throw new Error(`Không tìm thấy lô hàng nhập kho ID: ${item.nhapHangId}`);
      }

      // Lấy giá bán lẻ/sỉ của sản phẩm trong lô hàng này
      const impProduct = impSlip.danhSachSanPham.find(p => p.sanPhamId.toString() === sp._id.toString());
      let batchGia = 0;
      if (loaiGia === 'si') {
        batchGia = impProduct ? (impProduct.giaSi || sp.giaSi || 0) : (sp.giaSi || 0);
      } else {
        batchGia = impProduct ? (impProduct.giaBan || sp.giaBan || 0) : (sp.giaBan || 0);
      }

      // Kiểm tra tồn kho động của lô hàng cụ thể nếu đơn hàng sẽ trừ kho ngay
      if (isDeductStock) {
        const stockChanges = await LichSuKho.find({
          sanPhamId: sp._id,
          $or: [
            { nhapHangId: item.nhapHangId },
            { loaiThayDoi: 'nhap_hang', maThamChieu: item.nhapHangId }
          ]
        });
        const currentStock = stockChanges.reduce((sum, log) => sum + log.soLuongThayDoi, 0);

        if (currentStock < item.soLuong) {
          res.status(400);
          throw new Error(`Sản phẩm "${sp.tenSanPham}" thuộc lô "${impSlip.maDonNhap}" không đủ hàng tồn kho (Tồn: ${currentStock}, Yêu cầu: ${item.soLuong})`);
        }
      }

      const itemTotal = batchGia * item.soLuong;
      tongTien += itemTotal;

      verifiedProducts.push({
        sanPhamId: sp._id,
        maSKU: sp.maSKU,
        tenSanPham: sp.tenSanPham,
        soLuong: item.soLuong,
        donGia: batchGia, // Lưu giá bán tại thời điểm này theo lô hàng
        anhSanPham: sp.anhSanPham || '',
        nhapHangId: item.nhapHangId
      });
    }

    const actualTienGiamGia = Number(tienGiamGia) || 0;
    const finalAmount = tongTien - actualTienGiamGia;
    const tienConNo = Math.max(0, finalAmount - (Number(tienDaThanhToan) || 0) - (Number(tienDatCoc) || 0));

    // Xử lý lưu hoặc tạo thông tin khách hàng (model KhachHang)
    let resolvedKhachHangId = khachHangId || null;

    if (!resolvedKhachHangId && soDienThoaiKhach && soDienThoaiKhach.trim() !== '') {
      const trimmedPhone = soDienThoaiKhach.trim();
      const existingKh = await KhachHang.findOne({ soDienThoai: trimmedPhone });
      if (existingKh) {
        existingKh.tenKhachHang = tenKhachHang || existingKh.tenKhachHang;
        if (emailKhach) existingKh.email = emailKhach;
        if (diaChiKhach) existingKh.diaChi = diaChiKhach;
        existingKh.tongMuaHang += finalAmount;
        existingKh.noHienTai += tienConNo;
        await existingKh.save();
        resolvedKhachHangId = existingKh._id;
      } else {
        // Tự sinh mã khách hàng KHxxxxxx
        const latestCustomer = await KhachHang.findOne({ maKhachHang: /^KH\d+$/ }).sort({ createdAt: -1 });
        let nextNum = 1;
        if (latestCustomer) {
          const match = latestCustomer.maKhachHang.match(/^KH(\d+)$/);
          if (match) {
            nextNum = parseInt(match[1]) + 1;
          }
        }
        const generatedMaKH = `KH${String(nextNum).padStart(6, '0')}`;

        const newKh = await KhachHang.create({
          maKhachHang: generatedMaKH,
          tenKhachHang: tenKhachHang || 'Khách hàng',
          soDienThoai: trimmedPhone,
          email: emailKhach || '',
          diaChi: diaChiKhach || '',
          tongMuaHang: finalAmount,
          noHienTai: tienConNo
        });
        resolvedKhachHangId = newKh._id;
      }
    } else if (resolvedKhachHangId) {
      const khachHang = await KhachHang.findById(resolvedKhachHangId);
      if (khachHang) {
        khachHang.tongMuaHang += finalAmount;
        khachHang.noHienTai += tienConNo;
        if (tenKhachHang) khachHang.tenKhachHang = tenKhachHang;
        if (soDienThoaiKhach) khachHang.soDienThoai = soDienThoaiKhach;
        if (emailKhach) khachHang.email = emailKhach;
        if (diaChiKhach) khachHang.diaChi = diaChiKhach;
        await khachHang.save();
      }
    }

    // Xác định trạng thái ban đầu của đơn hàng
    let status = trangThai || (loaiDonHang === 'dat_hang' ? 'cho_xuly' : 'hoan_thanh');
    if (status === 'hoan_thanh' && tienConNo > 0) {
      status = 'con_no';
    }

    // Sinh mã đơn hàng tự động
    const maDonHang = await generateMaDonHang();

    // 2. Tạo đơn hàng
    const order = await DonHang.create({
      maDonHang,
      khachHangId: resolvedKhachHangId,
      tenKhachHang: tenKhachHang || 'Khách vãng lai',
      soDienThoaiKhach: soDienThoaiKhach || '',
      emailKhach: emailKhach || '',
      diaChiKhach: diaChiKhach || '',
      loaiDonHang: loaiDonHang || 'truc_tiep',
      danhSachSanPham: verifiedProducts,
      tongTien,
      tienGiamGia: actualTienGiamGia,
      tienDatCoc: Number(tienDatCoc) || 0,
      tienDaThanhToan: Number(tienDaThanhToan) || 0,
      tienConNo,
      trangThai: status,
      nguoiBan: req.user._id,
      ghiChu: ghiChu || '',
      loaiGia: loaiGia || 'le'
    });

    // 3. Nếu đơn hàng hoàn thành, đang giao hoặc còn nợ -> Trừ kho và tạo Dòng tiền thu
    if (status === 'hoan_thanh' || status === 'dang_giao' || status === 'con_no') {
      // Ghi log biến động LichSuKho (soLuongThayDoi < 0) theo từng lô hàng
      for (const item of verifiedProducts) {
        await LichSuKho.create({
          sanPhamId: item.sanPhamId,
          maSKU: item.maSKU,
          soLuongThayDoi: -item.soLuong,
          loaiThayDoi: 'ban_hang',
          maThamChieu: order._id,
          nhapHangId: item.nhapHangId, // Trừ đúng lô hàng đã chọn
          nguoiThucHien: req.user._id
        });
      }

      // Tạo Phiếu Thu dòng tiền loại 'ban_hang'
      const tongThanhToan = (order.tienDaThanhToan || 0) + (order.tienDatCoc || 0);
      if (tongThanhToan > 0) {
        const maGiaoDich = await generateMaGiaoDich('thu');
        await ThuChi.create({
          maGiaoDich,
          loaiGiaoDich: 'thu',
          danhMuc: 'ban_hang',
          soTien: tongThanhToan,
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

    await order.populate([
      { path: 'nguoiBan', select: 'hoTen tenDangNhap vaiTro' },
      { path: 'danhSachSanPham.sanPhamId', select: 'anhSanPham', model: 'SanPham' },
      { path: 'danhSachSanPham.nhapHangId', select: 'maDonNhap', model: 'NhapHang' }
    ]);

    // Phát tín hiệu socket real-time
    if (req.io) {
      req.io.emit('order:change', { action: 'create', data: order });
      if (status === 'hoan_thanh' || status === 'dang_giao' || status === 'con_no') {
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
        nhapHangId: itemGoc.nhapHangId || null,
        nguoiThucHien: req.user._id
      });
    }

    // Kiểm tra xem đơn hàng đã trả toàn bộ hay chưa
    let totalPurchased = order.danhSachSanPham.reduce((sum, p) => sum + p.soLuong, 0);
    let totalReturned = order.chiTietTraHang.sanPhamTraLai.reduce((sum, p) => sum + p.soLuong, 0);

    if (totalReturned === totalPurchased) {
      order.trangThai = 'da_tra';
    }

    // Cập nhật lại số tiền nợ còn lại (nếu đã trả hết hàng thì nợ = 0)
    const finalAmount = order.tongTien - (order.tienGiamGia || 0);
    const oldDebt = order.tienConNo;
    order.tienConNo = order.trangThai === 'da_tra' ? 0 : Math.max(0, finalAmount - order.tienDaThanhToan - order.tienDatCoc);

    // Cập nhật công nợ và tổng mua của khách hàng
    if (order.khachHangId) {
      const khachHang = await KhachHang.findById(order.khachHangId);
      if (khachHang) {
        // Giảm trừ tổng mua dựa trên số lượng sản phẩm trả đợt này
        let moneyReturnedProducts = 0;
        for (const item of sanPhamTraLai) {
          const itemGoc = order.danhSachSanPham.find(p => p.sanPhamId.toString() === item.sanPhamId.toString());
          moneyReturnedProducts += item.soLuong * itemGoc.donGia;
        }
        khachHang.tongMuaHang = Math.max(0, khachHang.tongMuaHang - moneyReturnedProducts);
        
        // Cập nhật nợ: nợ thay đổi bằng nợ cũ trừ nợ mới
        const debtDiff = oldDebt - order.tienConNo;
        khachHang.noHienTai = Math.max(0, khachHang.noHienTai - debtDiff);
        await khachHang.save();
      }
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

    await order.populate([
      { path: 'nguoiBan', select: 'hoTen tenDangNhap vaiTro' },
      { path: 'danhSachSanPham.sanPhamId', select: 'anhSanPham', model: 'SanPham' },
      { path: 'danhSachSanPham.nhapHangId', select: 'maDonNhap', model: 'NhapHang' }
    ]);

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

    if (order.trangThai === 'hoan_thanh' || order.trangThai === 'con_no' || order.trangThai === 'da_tra') {
      res.status(400);
      throw new Error('Đơn hàng đã ở trạng thái hoàn thành, còn nợ hoặc đã trả hàng, không thể thay đổi trạng thái');
    }

    const previousStatus = order.trangThai;
    const finalAmount = order.tongTien - (order.tienGiamGia || 0);
    const calculatedDebt = Math.max(0, finalAmount - order.tienDaThanhToan - order.tienDatCoc);

    let targetStatus = trangThai;
    if (targetStatus === 'hoan_thanh' && calculatedDebt > 0) {
      targetStatus = 'con_no';
    }

    order.trangThai = targetStatus;

    // Logic: Nếu chuyển đổi trạng thái từ 'cho_xuly' (đặt hàng trước) sang 'hoan_thanh'/'con_no' hoặc 'dang_giao'
    if (
      (previousStatus === 'cho_xuly') &&
      (targetStatus === 'hoan_thanh' || targetStatus === 'con_no' || targetStatus === 'dang_giao')
    ) {


      // 2. Trừ kho
      for (const item of order.danhSachSanPham) {
        await LichSuKho.create({
          sanPhamId: item.sanPhamId,
          maSKU: item.maSKU,
          soLuongThayDoi: -item.soLuong,
          loaiThayDoi: 'ban_hang',
          maThamChieu: order._id,
          nhapHangId: item.nhapHangId || null,
          nguoiThucHien: req.user._id
        });
      }

    }

    // Cập nhật lại số tiền nợ còn lại (nếu đã trả hết hàng thì nợ = 0)
    order.tienConNo = order.trangThai === 'da_tra' ? 0 : calculatedDebt;

    await order.save();
    await order.populate([
      { path: 'nguoiBan', select: 'hoTen tenDangNhap vaiTro' },
      { path: 'danhSachSanPham.sanPhamId', select: 'anhSanPham', model: 'SanPham' },
      { path: 'danhSachSanPham.nhapHangId', select: 'maDonNhap', model: 'NhapHang' }
    ]);

    // Phát tín hiệu real-time
    if (req.io) {
      req.io.emit('order:change', { action: 'update_status', data: order });
      if (targetStatus === 'hoan_thanh' || targetStatus === 'con_no' || targetStatus === 'dang_giao') {
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

// @desc    Chỉnh sửa thông tin đơn hàng & thanh toán
// @route   PUT /api/orders/:id
// @access  Private
const capNhatDonHang = async (req, res) => {
  try {
    const { tenKhachHang, soDienThoaiKhach, emailKhach, diaChiKhach, ghiChu, tienDaThanhToan } = req.body;
    const order = await DonHang.findById(req.params.id);

    if (!order) {
      res.status(404);
      throw new Error('Không tìm thấy đơn hàng');
    }

    if (tenKhachHang !== undefined) order.tenKhachHang = tenKhachHang;
    if (soDienThoaiKhach !== undefined) order.soDienThoaiKhach = soDienThoaiKhach;
    if (emailKhach !== undefined) order.emailKhach = emailKhach;
    if (diaChiKhach !== undefined) order.diaChiKhach = diaChiKhach;
    if (ghiChu !== undefined) order.ghiChu = ghiChu;

    const finalAmount = order.tongTien - (order.tienGiamGia || 0);

    if (tienDaThanhToan !== undefined) {
      const parsedNewPaid = Number(tienDaThanhToan) || 0;
      const difference = parsedNewPaid - order.tienDaThanhToan;
      if (difference > 0) {
        const maGiaoDich = await generateMaGiaoDich('thu');
        await ThuChi.create({
          maGiaoDich,
          loaiGiaoDich: 'thu',
          danhMuc: 'ban_hang',
          soTien: difference,
          maThamChieu: order._id,
          moTa: `Thu thêm tiền cho đơn hàng ${order.maDonHang}`,
          nguoiThucHien: req.user._id
        });
      } else if (difference < 0) {
        const maGiaoDich = await generateMaGiaoDich('chi');
        await ThuChi.create({
          maGiaoDich,
          loaiGiaoDich: 'chi',
          danhMuc: 'chi_khac',
          soTien: Math.abs(difference),
          maThamChieu: order._id,
          moTa: `Hoàn bớt tiền thanh toán cho đơn hàng ${order.maDonHang}`,
          nguoiThucHien: req.user._id
        });
      }
      
      // Cập nhật công nợ của khách hàng tương ứng với phần thay đổi thanh toán
      if (order.khachHangId) {
        const khachHang = await KhachHang.findById(order.khachHangId);
        if (khachHang) {
          khachHang.noHienTai = Math.max(0, khachHang.noHienTai - difference);
          await khachHang.save();
        }
      }
      
      order.tienDaThanhToan = parsedNewPaid;
    }

    // Cập nhật lại số tiền nợ còn lại
    order.tienConNo = order.trangThai === 'da_tra' ? 0 : Math.max(0, finalAmount - order.tienDaThanhToan - order.tienDatCoc);

    // Nếu đơn hàng đã hoàn thành hoặc đang nợ, cập nhật lại trạng thái theo số nợ mới
    if (order.trangThai === 'hoan_thanh' || order.trangThai === 'con_no') {
      order.trangThai = order.tienConNo > 0 ? 'con_no' : 'hoan_thanh';
    }

    await order.save();
    await order.populate([
      { path: 'nguoiBan', select: 'hoTen tenDangNhap vaiTro' },
      { path: 'danhSachSanPham.sanPhamId', select: 'anhSanPham', model: 'SanPham' },
      { path: 'danhSachSanPham.nhapHangId', select: 'maDonNhap', model: 'NhapHang' }
    ]);

    // Phát tín hiệu real-time
    if (req.io) {
      req.io.emit('order:change', { action: 'update', data: order });
      req.io.emit('cashflow:change', { action: 'create', source: 'order_update' });
    }

    res.json({
      success: true,
      message: 'Cập nhật đơn hàng thành công',
      data: order
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi cập nhật đơn hàng');
  }
};

// @desc    Xóa đơn hàng
// @route   DELETE /api/orders/:id
// @access  Private
const xoaDonHang = async (req, res) => {
  try {
    const order = await DonHang.findById(req.params.id);

    if (!order) {
      res.status(404);
      throw new Error('Không tìm thấy đơn hàng');
    }

    // 1. Nếu đơn hàng đã hoàn thành, đang giao hoặc còn nợ -> Hoàn lại tồn kho
    if (order.trangThai === 'hoan_thanh' || order.trangThai === 'dang_giao' || order.trangThai === 'con_no') {
      for (const item of order.danhSachSanPham) {
        await LichSuKho.create({
          sanPhamId: item.sanPhamId,
          maSKU: item.maSKU,
          soLuongThayDoi: item.soLuong, // Cộng lại kho
          loaiThayDoi: 'tra_hang', // Ghi nhận là trả hàng/hủy đơn
          maThamChieu: order._id,
          nhapHangId: item.nhapHangId || null,
          nguoiThucHien: req.user._id
        });
      }
    }

    // Hoàn tác đóng góp đơn hàng cho khách hàng
    if (order.khachHangId) {
      const khachHang = await KhachHang.findById(order.khachHangId);
      if (khachHang) {
        const finalAmount = order.tongTien - (order.tienGiamGia || 0);
        khachHang.tongMuaHang = Math.max(0, khachHang.tongMuaHang - finalAmount);
        khachHang.noHienTai = Math.max(0, khachHang.noHienTai - order.tienConNo);
        await khachHang.save();
      }
    }

    // 2. Xóa các phiếu thu chi liên quan đến đơn hàng này
    await ThuChi.deleteMany({ maThamChieu: order._id });

    // 3. Xóa đơn hàng
    await order.deleteOne();

    // Phát tín hiệu real-time
    if (req.io) {
      req.io.emit('order:change', { action: 'delete', orderId: req.params.id });
      req.io.emit('stock:change', { action: 'return', source: 'order', orderId: req.params.id });
      req.io.emit('cashflow:change', { action: 'delete', source: 'order' });
    }

    res.json({
      success: true,
      message: 'Xóa đơn hàng thành công'
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi khi xóa đơn hàng');
  }
};

module.exports = {
  danhSachDonHang,
  chiTietDonHang,
  taoDonHang,
  traHang,
  capNhatTrangThaiDonHang,
  capNhatDonHang,
  xoaDonHang
};
