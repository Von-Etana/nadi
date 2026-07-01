/**
 * Nadi Digital Service - Server Entry Point
 * Production-hardened with proper security, validation, and error handling.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const logger = require('./utils/logger');
const validateEnv = require('./utils/validateEnv');
const errorHandler = require('./middleware/errorHandler');
const supabase = require('./utils/supabase');

// Import routes
const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const utilitiesRoutes = require('./routes/utilities');
const giftcardRoutes = require('./routes/giftcards');
const cryptoRoutes = require('./routes/crypto');
const logisticsRoutes = require('./routes/logistics');
const fuelRoutes = require('./routes/fuel');
const notificationRoutes = require('./routes/notifications');
const supportRoutes = require('./routes/support');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhooks');

// ==============================
// Validate Environment Variables
// ==============================
validateEnv();

// ==============================
// Express App Setup
// ==============================
const app = express();
const server = http.createServer(app);

// ==============================
// Security Middleware
// ==============================

// Helmet — security headers with proper CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://checkout.flutterwave.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.flutterwave.com"],
      frameSrc: ["'self'", "https://checkout.flutterwave.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow cross-origin resources for payment providers
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS — explicit origin, no wildcard with credentials
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim());

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

// Compression
app.use(compression());

// Body parsing — webhooks need raw body for signature verification
app.use('/api/v1/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Parse raw body back to JSON for webhook routes
app.use('/api/v1/webhooks', (req, res, next) => {
  if (Buffer.isBuffer(req.body)) {
    req.rawBody = req.body;
    try {
      req.body = JSON.parse(req.body.toString());
    } catch (e) {
      return res.status(400).json({ message: 'Invalid JSON payload' });
    }
  }
  next();
});

// ==============================
// Rate Limiting
// ==============================

// Global rate limit
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', globalLimiter);

// Strict rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15, // 15 attempts per 15 minutes
  message: { success: false, message: 'Too many authentication attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/v1/auth/forgot-password', authLimiter);

// Strict rate limit for financial endpoints
const financialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many financial requests' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/v1/wallet/transfer', financialLimiter);
app.use('/api/v1/wallet/withdraw', financialLimiter);

// ==============================
// API Routes
// ==============================
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/utilities', utilitiesRoutes);
app.use('/api/v1/giftcards', giftcardRoutes);
app.use('/api/v1/crypto', cryptoRoutes);
app.use('/api/v1/logistics', logisticsRoutes);
app.use('/api/v1/fuel', fuelRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/support', supportRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// ==============================
// Health Check
// ==============================
app.get('/health', async (req, res) => {
  let dbStatus = 'disconnected';
  try {
    const { error: dbError } = await supabase.from('users').select('id').limit(1);
    if (!dbError) {
      dbStatus = 'connected';
    }
  } catch (err) {
    logger.error('Database health check failed:', err);
  }
  
  const status = dbStatus === 'connected' ? 200 : 503;
  
  res.status(status).json({
    status: dbStatus === 'connected' ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatus,
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API docs placeholder
app.get('/api/docs', (req, res) => {
  res.json({
    message: 'API documentation',
    version: 'v1',
    baseUrl: '/api/v1',
    endpoints: {
      auth: '/api/v1/auth',
      wallet: '/api/v1/wallet',
      utilities: '/api/v1/utilities',
      giftcards: '/api/v1/giftcards',
      crypto: '/api/v1/crypto',
      logistics: '/api/v1/logistics',
      fuel: '/api/v1/fuel',
      notifications: '/api/v1/notifications',
      support: '/api/v1/support',
      admin: '/api/v1/admin (requires admin role)',
    }
  });
});

// ==============================
// Error Handling
// ==============================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Global error handler
app.use(errorHandler);

// ==============================
// Socket.IO — Authenticated
// ==============================
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Socket.IO authentication middleware — verify JWT directly with Supabase
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  
  if (!token) {
    return next(new Error('Authentication required'));
  }
  
  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !authUser) {
      return next(new Error('Invalid or expired token'));
    }
    
    socket.userId = authUser.id;
    next();
  } catch (err) {
    return next(new Error('Invalid or expired token'));
  }
});

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.userId}`);
  
  // Auto-join user's personal room
  socket.join(`user:${socket.userId}`);

  // Handle admin room join — verify role from database
  socket.on('join_admin', async () => {
    try {
      const { data: user } = await supabase
        .from('users')
        .select('role')
        .eq('id', socket.userId)
        .maybeSingle();
      
      if (user && ['admin', 'super_admin'].includes(user.role)) {
        socket.join('admin');
        logger.info(`Admin joined admin room: ${socket.userId}`);
      } else {
        socket.emit('error', { message: 'Access denied' });
      }
    } catch (err) {
      logger.error('Admin room join error:', err);
    }
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.userId}`);
  });
});

// Make io accessible to routes for emitting events
app.set('io', io);

// ==============================
// Start Server
// ==============================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// ==============================
// Graceful Shutdown
// ==============================
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Close Socket.IO connections
  io.close(() => {
    logger.info('Socket.IO server closed');
  });

  // Close database connection (N/A for stateless Supabase client)

  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
  // Don't crash — log and continue
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  // Gracefully shutdown — the process is in an undefined state
  gracefulShutdown('uncaughtException');
});

module.exports = { app, server, io };
