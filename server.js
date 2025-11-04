require('dotenv').config();

const express = require('express');
const cors = require('cors');
const midtransClient = require('midtrans-client');
const app = express();
const port = process.env.PORT || 3000;

// ✅ Middleware CORS yang lebih spesifik
const corsOptions = {
  origin: [
    'https://oleh2in-pos-v2.web.app',   // Domain hosting Anda
    'http://localhost:5000',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://localhost:5173',  // Tambahkan port yang Anda gunakan
    'http://localhost:8080',  // Port lain yang mungkin digunakan
    null  // Untuk mendukung request dari file://
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200 // Beberapa browser legacy membutuhkan ini
};

// Terapkan CORS sebelum middleware lainnya
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

app.use(express.json());

// Debug middleware
app.use((req, res, next) => {
  console.log(`🔍 ${req.method} ${req.url} from ${req.get('Origin') || 'Unknown'}`);
  next();
});

// ✅ CEK ENVIRONMENT VARIABLES
if (!process.env.MIDTRANS_SERVER_KEY || !process.env.MIDTRANS_CLIENT_KEY) {
  console.error('❌ ERROR: Midtrans environment variables not set!');
}

// Midtrans config
const snap = new midtransClient.Snap({
  isProduction: process.env.NODE_ENV === 'production',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// ✅ CHECK ENV ENDPOINT
app.get('/check-env', (req, res) => {
  res.json({
    message: "Checking environment variables on server",
    node_env: process.env.NODE_ENV,
    server_key_exists: !!process.env.MIDTRANS_SERVER_KEY,
    server_key_length: process.env.MIDTRANS_SERVER_KEY ? process.env.MIDTRANS_SERVER_KEY.length : 0,
    server_key_preview: process.env.MIDTRANS_SERVER_KEY ? process.env.MIDTRANS_SERVER_KEY.substring(0, 20) + '...' : 'NOT_SET',
    client_key_exists: !!process.env.MIDTRANS_CLIENT_KEY,
    client_key_length: process.env.MIDTRANS_CLIENT_KEY ? process.env.MIDTRANS_CLIENT_KEY.length : 0,
    client_key_preview: process.env.MIDTRANS_CLIENT_KEY ? process.env.MIDTRANS_CLIENT_KEY.substring(0, 20) + '...' : 'NOT_SET',
  });
});

// ✅ TEST MIDTRANS ENDPOINT
app.get('/test-midtrans', (req, res) => {
  console.log('🧪 Testing Midtrans connection...');
  
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

// ✅ API endpoint untuk mendapatkan Snap Token
app.post('/get-snap-token', async (req, res) => {
  console.log('🎯 POST /get-snap-token RECEIVED!');

  try {
    if (!process.env.MIDTRANS_SERVER_KEY) {
      throw new Error('Server configuration error: MIDTRANS_SERVER_KEY not set');
    }

    const { transaction_details, customer_details, item_details } = req.body;

    // Validasi input
    if (!transaction_details?.order_id || !transaction_details?.gross_amount) {
      throw new Error('Missing required fields: order_id or gross_amount');
    }

    // Pastikan gross_amount berupa number
    transaction_details.gross_amount = Number(transaction_details.gross_amount);

    const parameter = {
      transaction_details,
      customer_details: customer_details || {
        first_name: "Customer",
        email: "customer@example.com",
        phone: "08123456789"
      },
      item_details: item_details || [],
      credit_card: { secure: true },
    };

    console.log('📤 Sending to Midtrans:', JSON.stringify(parameter, null, 2));

    // Kirim ke Midtrans
    const transaction = await snap.createTransaction(parameter);

    console.log('✅ SUCCESS! Token created:', transaction.token);

    res.json({
      success: true,
      token: transaction.token,
      redirect_url: transaction.redirect_url
    });
  } catch (error) {
    console.error('❌ ERROR get-snap-token:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
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

// Static files
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
});
