const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const options = {
      // Giới hạn số lượng kết nối tối đa (Ví dụ: 10 cho VPS nhỏ)
      maxPoolSize: 10, 
      // Thời gian chờ tối đa khi kết nối (tránh treo app quá lâu)
      serverSelectionTimeoutMS: 5000, 
      socketTimeoutMS: 45000,
    };

    await mongoose.connect(process.env.MONGO_URI, options);
    console.log("✅ MongoDB connected successfully");

    // Lắng nghe các sự kiện lỗi khi đang chạy để log ra check leak
    mongoose.connection.on("error", (err) => {
      console.error("❌ Mongoose runtime error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️ Mongoose disconnected. Reconnecting...");
    });

  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    // process.exit(1);
    // Thay vì exit ngay, có thể retry sau 5s nếu ông muốn server tự cứu mình
    setTimeout(connectDB, 5000);
  }
};

module.exports = connectDB;
