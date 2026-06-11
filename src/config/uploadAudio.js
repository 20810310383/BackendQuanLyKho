const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Đảm bảo thư mục tồn tại
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Thay đổi đường dẫn lưu vào thư mục audios
    const uploadPath = path.join(
      __dirname,
      "../../public/uploads/audios"
    );
    ensureDir(uploadPath);
    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const fileName = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${ext}`;
    cb(null, fileName);
  },
});

const fileFilter = (req, file, cb) => {
  // Chấp nhận file audio (mp3, wav, mpeg, v.v.)
  if (!file.mimetype.startsWith("audio/")) {
    return cb(new Error("File không phải định dạng âm thanh"), false);
  }
  cb(null, true);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // Giới hạn 50MB (thường đủ cho mp3)
});