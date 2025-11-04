require('dotenv').config();
const express = require('express');
const cors = require('cors');
const midtransClient = require('midtrans-client');
const path = require('path');

const app = express();
const port = process.env.PORT || 4000;

// ✅ CORS CONFIG
const corsOptions = {
  origin: [
    'https://oleh2in-pos-v2.web.app',
    'http://localhost:4200',
    'http://localhost:3000',
    'http://localhost:5173',
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.use(express.json());

// ✅ MIDTRANS SNAP CONFIG
if (!process.env.MIDTRANS_SERVER_KEY || !process.env.MIDTRANS_CLIENT_KEY) {
  console.warn('⚠️ MIDTRANS KEYS are missing. Please set .env properly.');
}

const snap = new midtransClient.Snap({
  isProduction: process.env.NODE_ENV === 'production',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

// ✅ CHECK ENV ENDPOINT
app.get('/check-env', (req, res) => {
  res.json({
    message: 'Checking environment variables on server',
    node_env: process.env.NODE_ENV,
    server_key_exists: !!process.env.MIDTRANS_SERVER_KEY,
    server_key_length: process.env.MIDTRANS_SERVER_KEY?.length || 0,
    server_key_preview: process.env.MIDTRANS_SERVER_KEY
      ? process.env.MIDTRANS_SERVER_KEY.substring(0, 20) + '...'
      : 'NOT_SET',
    client_key_exists: !!process.env.MIDTRANS_CLIENT_KEY,
    client_key_length: process.env.MIDTRANS_CLIENT_KEY?.length || 0,
    client_key_preview: process.env.MIDTRANS_CLIENT_KEY
      ? process.env.MIDTRANS_CLIENT_KEY.substring(0, 20) + '...'
      : 'NOT_SET',
  });
});

// ✅ TEST MIDTRANS CONNECTION
app.get('/test-midtrans', async (req, res) => {
  try {
    if (!process.env.MIDTRANS_SERVER_KEY) {
      return res.status(500).json({
        success: false,
        error: 'MIDTRANS_SERVER_KEY not set in environment',
      });
    }

    const testData = {
      transaction_details: {
        order_id: 'TEST-' + Date.now(),
        gross_amount: 1000,
      },
    };

    const transaction = await snap.createTransaction(testData);
    res.json({
      success: true,
      message: 'Midtrans connection OK',
      token: transaction.token,
    });
  } catch (error) {
    console.error('❌ Midtrans Test Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ✅ MAIN SNAP TOKEN ENDPOINT
app.post('/get-snap-token', async (req, res) => {
  try {
    const { order_id, gross_amount, customer_details, item_details } = req.body;

    if (!order_id || !gross_amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: order_id or gross_amount',
      });
    }

    const parameter = {
      transaction_details: { order_id, gross_amount },
      customer_details: customer_details || {},
      item_details: item_details || [],
    };

    const transaction = await snap.createTransaction(parameter);
    res.json({
      success: true,
      token: transaction.token,
    });
  } catch (error) {
    console.error('❌ Error generating Snap token:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ✅ ROOT ENDPOINT
app.get('/', (req, res) => {
  res.json({
    status: 'active',
    message: '🚀 INDOCART Backend Server is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    midtrans_configured: !!process.env.MIDTRANS_SERVER_KEY,
  });
});

// ✅ SIMPLE DEPLOY CHECK
app.get('/am-i-updated', (req, res) => {
  res.send('✅ YES, THE SERVER IS UPDATED WITH THE LATEST CODE!');
});

// ✅ GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.error('❌ SERVER ERROR:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
  });
});

// ✅ START SERVER
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
