const multer = require("multer");
const path = require("path");
const fs = require("fs");

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Lưu vào thư mục docs thay vì images
    const uploadPath = path.join(__dirname, "../../public/uploads/docs");
    ensureDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, fileName);
  },
});

const fileFilter = (req, file, cb) => {
  // Chấp nhận các định dạng Word
  const allowedTypes = [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  
  if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(doc|docx)$/)) {
    cb(null, true);
  } else {
    cb(new Error("Định dạng file không hỗ trợ, vui lòng gửi file .doc hoặc .docx"), false);
  }
};

const uploadWord = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB cho file tài liệu
});

module.exports = { uploadWord };