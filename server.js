require('dotenv').config();

const express = require('express');
const cors = require('cors');
const midtransClient = require('midtrans-client');
const app = express();
const port = process.env.PORT || 3000;

// ✅ CORS Configuration yang Benar
const corsOptions = {
  origin: [
    'https://oleh2in-pos-new.web.app', // Domain Firebase Hosting Anda
    'http://localhost:5000',
    'http://localhost:3000',
    'http://127.0.0.1:5500'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // Penting untuk cookies/auth
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

app.use(express.json());

// Debug middleware
app.use((req, res, next) => {
  console.log(`🔍 ${req.method} ${req.url} from ${req.get('Origin') || 'Unknown'}`);
  next();
});

// Midtrans config
const snap = new midtransClient.Snap({
  isProduction: process.env.NODE_ENV === 'production',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'active',
    message: '🚀 INDOCART Backend Server is running!',
    timestamp: new Date().toISOString(),
    origin: req.get('Origin')
  });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({
    message: 'Backend is working!',
    time: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    origin: req.get('Origin')
  });
});

// API endpoint untuk mendapatkan Snap Token
app.post('/get-snap-token', (req, res) => {
  console.log('🎯 POST /get-snap-token RECEIVED!');
  console.log('📋 Request body:', JSON.stringify(req.body, null, 2));

  const { transaction_details, customer_details, item_details } = req.body;

  // Validasi data
  if (!transaction_details || !transaction_details.order_id || !transaction_details.gross_amount) {
    return res.status(400).json({ 
      success: false,
      error: 'Transaction details are required',
      message: 'Missing required fields: order_id, gross_amount'
    });
  }

  const parameter = {
    transaction_details,
    customer_details: customer_details || {
      first_name: "Customer",
      email: "customer@example.com",
      phone: "08123456789"
    },
    item_details: item_details || []
  };

  console.log('📤 Sending to Midtrans...');

  snap.createTransaction(parameter)
    .then((transaction) => {
      console.log('✅ SUCCESS! Token created');
      console.log('🔑 Token:', transaction.token.substring(0, 20) + '...');

      res.json({
        success: true,
        token: transaction.token,
        redirect_url: transaction.redirect_url
      });
    })
    .catch((error) => {
      console.error('❌ ERROR:', error.message);
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    });
});

// API endpoint untuk notifikasi dari Midtrans (webhook)
app.post('/midtrans-notification', (req, res) => {
  console.log('🔔 Midtrans notification received:', JSON.stringify(req.body, null, 2));
  
  res.status(200).json({ 
    success: true,
    message: 'Notification received'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ SERVER ERROR:', err.message);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

app.listen(port, () => {
  console.log(`🚀 INDOCART Backend Server running at http://localhost:${port}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 Debug mode: ALL requests will be logged`);
});

