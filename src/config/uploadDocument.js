const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Hàm tự động tạo thư mục nếu chưa có
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Lưu tất cả vào thư mục docs
    const uploadPath = path.join(__dirname, "../../public/uploads/docs");
    ensureDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Đổi tên file: timestamp-random.ext (tránh trùng lặp và lỗi font tiếng Việt)
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "application/pdf", // PDF
    "application/msword", // .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Chỉ hỗ trợ định dạng .pdf, .doc hoặc .docx!"), false);
  }
};

const uploadDoc = multer({
  storage,
  fileFilter,
  limits: { fileSize: 30 * 1024 * 1024 }, // Tăng lên 30MB cho thoải mái
});

module.exports = { uploadDoc };