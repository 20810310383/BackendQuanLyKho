const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const connectDB = require('./src/config/connectDB');
const { notFound, errorHandler } = require('./src/middlewares/errorMiddleware');

// Load env variables
dotenv.config();

// Connect to MongoDB
connectDB();

// Cấu hình các domain frontend được phép truy cập
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : [];

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Map để theo dõi socket nào gắn với userId nào (socket.id -> userId)
const onlineUsers = new Map();

// Lắng nghe kết nối Real-time qua Socket.io
io.on('connection', (socket) => {
  console.log(`Đã kết nối Socket: ${socket.id}`);
  
  socket.on('user:online', (userId) => {
    onlineUsers.set(socket.id, userId);
    console.log(`User ${userId} đang online (Socket: ${socket.id})`);
    // Gửi danh sách các userId đang online cho tất cả client
    io.emit('users:online', Array.from(new Set(onlineUsers.values())));
  });

  socket.on('users:get_online', () => {
    socket.emit('users:online', Array.from(new Set(onlineUsers.values())));
  });

  socket.on('disconnect', () => {
    console.log(`Đã ngắt kết nối Socket: ${socket.id}`);
    onlineUsers.delete(socket.id);
    // Gửi danh sách cập nhật
    io.emit('users:online', Array.from(new Set(onlineUsers.values())));
  });
});

// Middleware chia sẻ instance io tới request object
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: false,
}));

// CORS configuration - chỉ cho phép domain nội bộ truy cập
app.use(cors({
  origin: allowedOrigins,
  credentials: true, // Cho phép nhận cookie từ frontend
}));

// Body parser & Cookie parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Base Route
app.get('/', (req, res) => {
  res.json({ message: 'API hệ thống Quản lý Kho & Bán hàng đang hoạt động bình thường.' });
});

// Serve Static Uploads Files
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Register API Routes
app.use('/api/auth', require('./src/routes/authRoutes'));
app.use('/api/products', require('./src/routes/productRoutes'));
app.use('/api/orders', require('./src/routes/orderRoutes'));
app.use('/api/imports', require('./src/routes/importRoutes'));
app.use('/api/cashflows', require('./src/routes/cashFlowRoutes'));
app.use('/api/reports', require('./src/routes/reportRoutes'));
app.use('/api/customers', require('./src/routes/customerRoutes'));
app.use('/api/suppliers', require('./src/routes/supplierRoutes'));
app.use('/api/users', require('./src/routes/userRoutes'));


// Register Upload Routes
app.use('/api/uploads', require('./src/routes/uploadAudioRoute'));
app.use('/api/uploads', require('./src/routes/uploadDocumentRoute'));
app.use('/api/uploads', require('./src/routes/uploadImageRoute'));
app.use('/api/uploads', require('./src/routes/uploadVideoRoute'));

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
