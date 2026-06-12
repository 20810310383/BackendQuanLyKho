exports.uploadDocument = (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn file tài liệu hợp lệ",
      });
    }

    // Đường dẫn để lưu vào DB (bỏ chữ public để frontend gọi được luôn)
    const fileUrl = `/uploads/docs/${req.file.filename}`;

    res.status(200).json({
      success: true,
      message: "Upload tài liệu thành công!",
      data: {
        originalName: req.file.originalname,
        fileName: req.file.filename,
        fileUrl: fileUrl,
        fileSize: (req.file.size / (1024 * 1024)).toFixed(2) + " MB",
        mimeType: req.file.mimetype,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};