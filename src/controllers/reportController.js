const SanPham = require('../models/SanPham');
const DonHang = require('../models/DonHang');
const LichSuKho = require('../models/LichSuKho');
const ThuChi = require('../models/ThuChi');

// @desc    Báo cáo Xuất - Nhập - Tồn động trong khoảng thời gian
// @route   GET /api/reports/inventory
// @access  Private
const baoCaoXuatNhapTon = async (req, res) => {
  try {
    const tuNgayStr = req.query.tuNgay;
    const denNgayStr = req.query.denNgay;

    // Mặc định từ ngày 1 của tháng hiện tại đến hôm nay
    const tuNgay = tuNgayStr ? new Date(tuNgayStr) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const denNgay = denNgayStr ? new Date(denNgayStr) : new Date();
    denNgay.setHours(23, 59, 59, 999);

    // 1. Lấy toàn bộ danh mục sản phẩm hoạt động
    const products = await SanPham.find({}).sort({ maSKU: 1 }).lean();

    // 2. Tính Tồn đầu kỳ: Tổng soLuongThayDoi trước tuNgay
    const openingStocks = await LichSuKho.aggregate([
      { $match: { createdAt: { $lt: tuNgay } } },
      { $group: { _id: "$sanPhamId", tonDauKy: { $sum: "$soLuongThayDoi" } } }
    ]);
    const openingStockMap = {};
    openingStocks.forEach(item => {
      openingStockMap[item._id.toString()] = item.tonDauKy;
    });

    // 3. Tính Nhập trong kỳ và Xuất trong kỳ
    const movements = await LichSuKho.aggregate([
      { $match: { createdAt: { $gte: tuNgay, $lte: denNgay } } },
      {
        $group: {
          _id: "$sanPhamId",
          nhapTrongKy: {
            $sum: {
              $cond: [
                { $gt: ["$soLuongThayDoi", 0] },
                "$soLuongThayDoi",
                0
              ]
            }
          },
          xuatTrongKy: {
            $sum: {
              $cond: [
                { $lt: ["$soLuongThayDoi", 0] },
                { $abs: "$soLuongThayDoi" },
                0
              ]
            }
          }
        }
      }
    ]);
    const movementMap = {};
    movements.forEach(item => {
      movementMap[item._id.toString()] = {
        nhapTrongKy: item.nhapTrongKy,
        xuatTrongKy: item.xuatTrongKy
      };
    });

    // 4. Tổ hợp dữ liệu báo cáo
    const reportData = products.map(p => {
      const idStr = p._id.toString();
      const tonDauKy = openingStockMap[idStr] || 0;
      const nhapTrongKy = movementMap[idStr]?.nhapTrongKy || 0;
      const xuatTrongKy = movementMap[idStr]?.xuatTrongKy || 0;
      const tonCuoiKy = tonDauKy + nhapTrongKy - xuatTrongKy;

      return {
        _id: p._id,
        maSKU: p.maSKU,
        tenSanPham: p.tenSanPham,
        anhSanPham: p.anhSanPham,
        donViTinh: p.donViTinh,
        giaNhap: p.giaNhap,
        giaBan: p.giaBan,
        tonDauKy,
        nhapTrongKy,
        xuatTrongKy,
        tonCuoiKy,
        giaTriTonCuoi: tonCuoiKy * p.giaNhap
      };
    });

    res.json({
      success: true,
      data: reportData,
      timeframe: {
        tuNgay,
        denNgay
      }
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Lỗi tính toán báo cáo Xuất-Nhập-Tồn: ${error.message}`);
  }
};

// @desc    Báo cáo doanh thu bán lẻ theo nhân viên/thu ngân trực ca
// @route   GET /api/reports/sales-by-cashier
// @access  Private
const baoCaoDoanhThuNhanVien = async (req, res) => {
  try {
    const tuNgayStr = req.query.tuNgay;
    const denNgayStr = req.query.denNgay;

    const tuNgay = tuNgayStr ? new Date(tuNgayStr) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const denNgay = denNgayStr ? new Date(denNgayStr) : new Date();
    denNgay.setHours(23, 59, 59, 999);

    const sales = await DonHang.aggregate([
      {
        $match: {
          trangThai: { $in: ['hoan_thanh', 'dang_giao'] },
          createdAt: { $gte: tuNgay, $lte: denNgay }
        }
      },
      {
        $group: {
          _id: "$nguoiBan",
          tongDoanhThu: { $sum: "$tienDaThanhToan" },
          soDonHang: { $sum: 1 },
          tongSanPhamBanDuoc: { $sum: { $sum: "$danhSachSanPham.soLuong" } }
        }
      },
      {
        $lookup: {
          from: "nguoidungs", // Collection name matching database
          localField: "_id",
          foreignField: "_id",
          as: "nhanVien"
        }
      },
      { $unwind: "$nhanVien" },
      {
        $project: {
          _id: 1,
          tongDoanhThu: 1,
          soDonHang: 1,
          tongSanPhamBanDuoc: 1,
          hoTen: "$nhanVien.hoTen",
          tenDangNhap: "$nhanVien.tenDangNhap"
        }
      },
      { $sort: { tongDoanhThu: -1 } }
    ]);

    res.json({
      success: true,
      data: sales,
      timeframe: {
        tuNgay,
        denNgay
      }
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Lỗi tính báo cáo doanh thu nhân viên: ${error.message}`);
  }
};

// @desc    Báo cáo Doanh thu - Giá vốn - Lợi nhuận
// @route   GET /api/reports/profit
// @access  Private
const baoCaoLoiNhuan = async (req, res) => {
  try {
    const tuNgayStr = req.query.tuNgay;
    const denNgayStr = req.query.denNgay;

    const tuNgay = tuNgayStr ? new Date(tuNgayStr) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const denNgay = denNgayStr ? new Date(denNgayStr) : new Date();
    denNgay.setHours(23, 59, 59, 999);

    // 1. Lấy toàn bộ đơn hàng có xuất kho trong kỳ để tính doanh thu & giá vốn (COGS)
    const orders = await DonHang.find({
      trangThai: { $in: ['hoan_thanh', 'dang_giao', 'con_no', 'da_tra'] },
      createdAt: { $gte: tuNgay, $lte: denNgay }
    }).populate({
      path: 'danhSachSanPham.sanPhamId',
      model: 'SanPham'
    });

    let doanhThuBanHang = 0;
    let giaVonHangBan = 0; // COGS

    orders.forEach(order => {
      // Doanh thu thực tế bằng tiền đã thanh toán (bao gồm cả cọc) trừ đi tiền đã hoàn lại khi trả hàng
      const tienHoan = (order.chiTietTraHang && order.chiTietTraHang.tienHoanLai) || 0;
      doanhThuBanHang += (order.tienDaThanhToan + order.tienDatCoc - tienHoan);

      order.danhSachSanPham.forEach(item => {
        // Tìm số lượng sản phẩm này đã trả lại trong đơn hàng
        let soLuongTra = 0;
        if (order.chiTietTraHang && order.chiTietTraHang.sanPhamTraLai) {
          const retItem = order.chiTietTraHang.sanPhamTraLai.find(
            r => r.sanPhamId && r.sanPhamId.toString() === (item.sanPhamId?._id || item.sanPhamId).toString()
          );
          if (retItem) {
            soLuongTra = retItem.soLuong;
          }
        }
        const soLuongThucBan = Math.max(0, item.soLuong - soLuongTra);

        // Lấy giá nhập gốc tại thời điểm lập báo cáo để làm cơ sở tính giá vốn
        const giaNhap = item.sanPhamId ? item.sanPhamId.giaNhap : (item.donGia * 0.6); // Fallback nếu SP bị xóa
        giaVonHangBan += soLuongThucBan * giaNhap;
      });
    });

    // 2. Lấy các khoản chi phí khác từ sổ quỹ thủ công trong kỳ
    // Loại trừ các khoản chi hoàn tiền tự động khi trả hàng bằng cách kiểm tra maThamChieu
    const otherExpenses = await ThuChi.aggregate([
      {
        $match: {
          loaiGiaoDich: 'chi',
          danhMuc: { $in: ['chi_mat_bang', 'chi_luong', 'chi_dien_nuoc', 'chi_khac'] },
          $or: [
            { maThamChieu: { $exists: false } },
            { maThamChieu: null }
          ],
          ngayGiaoDich: { $gte: tuNgay, $lte: denNgay }
        }
      },
      {
        $group: {
          _id: null,
          tongChiPhiKhac: { $sum: "$soTien" }
        }
      }
    ]);
    const chiPhiVanHanh = otherExpenses.length > 0 ? otherExpenses[0].tongChiPhiKhac : 0;

    // 3. Lợi nhuận
    const loiNhuanGop = doanhThuBanHang - giaVonHangBan;
    const loiNhuanRong = loiNhuanGop - chiPhiVanHanh;

    res.json({
      success: true,
      data: {
        doanhThuBanHang,
        giaVonHangBan,
        loiNhuanGop,
        chiPhiVanHanh,
        loiNhuanRong
      },
      timeframe: {
        tuNgay,
        denNgay
      }
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Lỗi tính báo cáo lợi nhuận: ${error.message}`);
  }
};

module.exports = {
  baoCaoXuatNhapTon,
  baoCaoDoanhThuNhanVien,
  baoCaoLoiNhuan
};
