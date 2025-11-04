require('dotenv').config();
const express = require('express');
const cors = require('cors');
const midtransClient = require('midtrans-client');
const path = require('path');

const app = express(); // ✅ HARUS ADA DI ATAS
const port = process.env.PORT || 3000;

// ✅ CORS
const corsOptions = {
  origin: [
    'https://oleh2in-pos-v2.web.app',
    'http://localhost:4200',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.use(express.json());

// ✅ KONFIGURASI MIDTRANS
const snap = new midtransClient.Snap({
  isProduction: process.env.NODE_ENV === 'production',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// ✅ CEK ENV
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

// ✅ TEST MIDTRANS
app.get('/test-midtrans', (req, res) => {
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
    }
  };

  snap.createTransaction(testData)
    .then((transaction) => {
      res.json({
        success: true,
        message: 'Midtrans connection OK',
        token: transaction.token
      });
    })
    .catch((error) => {
      res.status(500).json({
        success: false,
        error: error.message
      });
    });
});

// ✅ ENDPOINT SNAP TOKEN ASLI
app.post('/get-snap-token', async (req, res) => {
  try {
    const { order_id, gross_amount, customer_details, item_details } = req.body;

    const transaction = await snap.createTransaction({
      transaction_details: { order_id, gross_amount },
      customer_details,
      item_details
    });

    res.json({
      success: true,
      token: transaction.token
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ ROOT
app.get('/', (req, res) => {
  res.json({
    status: 'active',
    message: '🚀 INDOCART Backend Server is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    midtrans_configured: !!process.env.MIDTRANS_SERVER_KEY
  });
});

// ✅ CEK UPDATE
app.get('/am-i-updated', (req, res) => {
  res.send('YES, THE SERVER IS UPDATED WITH THE LATEST CODE!');
});

// ✅ STATIC PUBLIC FOLDER
app.use(express.static(path.join(__dirname, 'public')));

// ✅ SPA CATCH-ALL
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ ERROR HANDLER
app.use((err, req, res, next) => {
  console.error('❌ SERVER ERROR:', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ✅ START SERVER
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
