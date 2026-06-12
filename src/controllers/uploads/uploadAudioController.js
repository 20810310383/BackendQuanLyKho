const uploadAudio = (req, res) => {
  // 1. Kiểm tra xem file đã được Multer xử lý thành công chưa
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Không có file âm thanh hoặc định dạng không hợp lệ",
    });
  }

  // 2. Tạo đường dẫn URL để lưu vào Database hoặc trả về Frontend
  // Đường dẫn này khớp với thư mục public/uploads/audios mà mình đã tạo
  const audioUrl = `/uploads/audios/${req.file.filename}`;
  
  // Log thông tin file để anh dễ dàng debug trên VPS
  console.log("Đã nhận file audio:", req.file);

  // 3. Trả về phản hồi thành công
  res.status(200).json({
    success: true,
    message: "Upload âm thanh thành công",
    data: {
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size, // Trả về dung lượng để anh quản lý nếu cần
      url: audioUrl,
    },
  });
};

module.exports = {
  uploadAudio,
};