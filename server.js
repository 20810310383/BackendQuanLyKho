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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Lắng nghe kết nối Real-time qua Socket.io
io.on('connection', (socket) => {
  console.log(`Đã kết nối Socket: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`Đã ngắt kết nối Socket: ${socket.id}`);
  });
});

// Middleware chia sẻ instance io tới request object
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Security middleware
app.use(helmet());

// CORS configuration - chỉ cho phép domain nội bộ truy cập
app.use(cors({
  origin: process.env.FRONTEND_URL,
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
