require('dotenv').config();

const express = require('express');
const cors = require('cors');
const midtransClient = require('midtrans-client');
const app = express();
const port = process.env.PORT || 3000;

// ✅ Middleware CORS yang spesifik
const corsOptions = {
  origin: [
    'https://oleh2in-pos.web.app', // Domain Firebase Hosting Anda
    'http://localhost:5000',
    'http://localhost:3000',
    'http://127.0.0.1:5500'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', ''],
  credentials: true // Penting untuk cookies/auth
};

app.use(cors(corsOptions));
app.use(express.json());

// Debug middleware
app.use((req, res, next) => {
  console.log(`🔍 ${req.method} ${req.url} from ${req.get('Origin')}`);
  next();
});

// ✅ CEK ENVIRONMENT VARIABLES
if (!process.env.MIDTRANS_SERVER_KEY || !process.env.MIDTRANS_CLIENT_KEY) {
  console.error('❌ ERROR: Midtrans environment variables not set!');
  console.error('Please set MIDTRANS_SERVER_KEY and MIDTRANS_CLIENT_KEY in your environment');
}

// ✅ TEST MIDTRANS ENDPOINT (PALING ATAS)
app.get('/test-midtrans', (req, res) => {
  console.log('🧪 Testing Midtrans connection...');
  
  // Cek apakah environment variables sudah diatur
  if (!process.env.MIDTRANS_SERVER_KEY) {
    return res.status(500).json({
      success: false,
      error: 'MIDTRANS_SERVER_KEY environment variable not set'
    });
  }
  
  const testData = {
    transaction_details: {
      order_id: 'TEST-' + Date.now(),
      gross_amount: 1000
    },
    customer_details: {
      first_name: "Test",
      email: "test@example.com",
      phone: "08123456789"
    },
    item_details: [{
      id: 'TEST-ITEM',
      price: 1000,
      quantity: 1,
      name: 'Test Product'
    }]
  };

  snap.createTransaction(testData)
    .then((transaction) => {
      console.log('✅ Test successful!');
      res.json({
        success: true,
        message: 'Midtrans connection successful',
        token: transaction.token,
        environment: process.env.NODE_ENV || 'development'
      });
    })
    .catch((error) => {
      console.error('❌ Test failed:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
        environment: process.env.NODE_ENV || 'development'
      });
    });
});

// ✅ Midtrans config YANG SUDAH DIPERBAIKI
const snap = new midtransClient.Snap({
  isProduction: process.env.NODE_ENV === 'production', // ✅ BENAR SEKARANG!
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// API endpoint untuk mendapatkan Snap Token
app.post('/get-snap-token', (req, res) => {
  console.log('🎯 POST /get-snap-token RECEIVED!');
  console.log('📋 Request body:', JSON.stringify(req.body, null, 2));
  
  // Cek apakah environment variables sudah diatur
  if (!process.env.MIDTRANS_SERVER_KEY) {
    return res.status(500).json({
      success: false,
      error: 'Server configuration error: MIDTRANS_SERVER_KEY not set'
    });
  }
  
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
  
  // Di sini Anda bisa:
  // 1. Validasi signature dari Midtrans
  // 2. Update status pembayaran di database
  // 3. Kirim notifikasi ke frontend via WebSocket/Firebase
  
  res.status(200).json({ 
    success: true,
    message: 'Notification received'
  });
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'active',
    message: '🚀 INDOCART Backend Server is running!',
    timestamp: new Date().toISOString(),
    origin: req.get('Origin'),
    environment: process.env.NODE_ENV || 'development',
    midtrans_configured: !!process.env.MIDTRANS_SERVER_KEY
  });
});

// Static files PALING AKHIR
app.use(express.static('public'));

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ SERVER ERROR:', err.message);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error'
  });
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📱 Open http://localhost:${port}`);
  console.log(`📱 Test Midtrans: http://localhost:${port}/test-midtrans`);
});

