const ThuChi = require('../models/ThuChi');

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

// @desc    Lấy sổ quỹ thu chi (phân trang, bộ lọc, tìm kiếm)
// @route   GET /api/cashflows
// @access  Private
const danhSachThuChi = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};

    // Tìm kiếm theo mã giao dịch hoặc mô tả
    if (req.query.search) {
      query.$or = [
        { maGiaoDich: { $regex: req.query.search, $options: 'i' } },
        { moTa: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Bộ lọc loại giao dịch (thu / chi)
    if (req.query.loaiGiaoDich) {
      query.loaiGiaoDich = req.query.loaiGiaoDich;
    }

    // Bộ lọc danh mục thu chi
    if (req.query.danhMuc) {
      query.danhMuc = req.query.danhMuc;
    }

    // Bộ lọc khoảng thời gian giao dịch
    if (req.query.tuNgay || req.query.denNgay) {
      query.ngayGiaoDich = {};
      if (req.query.tuNgay) {
        query.ngayGiaoDich.$gte = new Date(req.query.tuNgay);
      }
      if (req.query.denNgay) {
        const endDate = new Date(req.query.denNgay);
        endDate.setHours(23, 59, 59, 999);
        query.ngayGiaoDich.$lte = endDate;
      }
    }

    const cashflows = await ThuChi.find(query)
      .populate('nguoiThucHien', 'hoTen tenDangNhap vaiTro')
      .sort({ ngayGiaoDich: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await ThuChi.countDocuments(query);

    // Tính tổng thu, tổng chi trong khoảng thời gian lọc (nếu có lọc thời gian) hoặc tổng quỹ
    const aggResult = await ThuChi.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$loaiGiaoDich",
          tongTien: { $sum: "$soTien" }
        }
      }
    ]);

    let tongThu = 0;
    let tongChi = 0;
    aggResult.forEach(item => {
      if (item._id === 'thu') tongThu = item.tongTien;
      if (item._id === 'chi') tongChi = item.tongTien;
    });

    res.json({
      success: true,
      data: cashflows,
      summary: {
        tongThu,
        tongChi,
        soDu: tongThu - tongChi
      },
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Lỗi lấy danh sách sổ quỹ thu chi: ${error.message}`);
  }
};

// @desc    Lập phiếu thu/chi thủ công
// @route   POST /api/cashflows
// @access  Private
const taoThuChiThuCong = async (req, res) => {
  try {
    const { loaiGiaoDich, danhMuc, soTien, moTa, ngayGiaoDich } = req.body;

    if (!loaiGiaoDich || !danhMuc || !soTien) {
      res.status(400);
      throw new Error('Vui lòng điền đầy đủ loại giao dịch, danh mục và số tiền');
    }

    if (Number(soTien) <= 0) {
      res.status(400);
      throw new Error('Số tiền phải lớn hơn 0');
    }

    // Kiểm tra danh mục thủ công (Không được lập đè danh mục tự động hệ thống)
    const validManualCategories = [
      'thu_no',
      'thu_khac',
      'chi_mat_bang',
      'chi_luong',
      'chi_dien_nuoc',
      'chi_khac'
    ];

    if (!validManualCategories.includes(danhMuc)) {
      res.status(400);
      throw new Error(
        `Danh mục "${danhMuc}" không hợp lệ cho giao dịch thủ công. Các danh mục tự động bán hàng/nhập hàng được hệ thống kiểm soát tự động.`
      );
    }

    // Sinh mã giao dịch tự động
    const maGiaoDich = await generateMaGiaoDich(loaiGiaoDich);

    const cashflow = await ThuChi.create({
      maGiaoDich,
      loaiGiaoDich,
      danhMuc,
      soTien: Number(soTien),
      moTa: moTa || '',
      nguoiThucHien: req.user._id,
      ngayGiaoDich: ngayGiaoDich ? new Date(ngayGiaoDich) : new Date()
    });

    // Phát tín hiệu real-time
    if (req.io) {
      req.io.emit('cashflow:change', { action: 'create_manual', data: cashflow });
    }

    res.status(201).json({
      success: true,
      message: `Tạo phiếu ${loaiGiaoDich === 'thu' ? 'thu' : 'chi'} thủ công thành công`,
      data: cashflow
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi lập phiếu thu chi thủ công');
  }
};

// @desc    Xóa phiếu thu/chi thủ công
// @route   DELETE /api/cashflows/:id
// @access  Private/Admin
const xoaThuChi = async (req, res) => {
  try {
    const cashflow = await ThuChi.findById(req.params.id);

    if (!cashflow) {
      res.status(404);
      throw new Error('Không tìm thấy giao dịch');
    }

    // Bảo vệ các giao dịch tự động: không cho xóa nếu có maThamChieu (được tạo tự động từ bán/nhập hàng)
    if (cashflow.maThamChieu || cashflow.danhMuc === 'ban_hang' || cashflow.danhMuc === 'nhap_hang') {
      res.status(400);
      throw new Error(
        'Không thể xóa phiếu thu/chi tự động. Để điều chỉnh dòng tiền này, bạn vui lòng hủy đơn nhập hoặc trả hàng trên đơn bán tương ứng.'
      );
    }

    await ThuChi.findByIdAndDelete(req.params.id);

    // Phát tín hiệu real-time
    if (req.io) {
      req.io.emit('cashflow:change', { action: 'delete_manual', data: { _id: req.params.id } });
    }

    res.json({
      success: true,
      message: 'Xóa phiếu thu chi thủ công thành công'
    });
  } catch (error) {
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Lỗi xóa phiếu thu chi');
  }
};

module.exports = {
  danhSachThuChi,
  taoThuChiThuCong,
  xoaThuChi
};
