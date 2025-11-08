require('dotenv').config();
const express = require('express');
const cors = require('cors');

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

// ✅ MIDTRANS CONFIG dengan safe loading
let snap = null;
let midtransError = null;

try {
  const midtransClient = require('midtrans-client');
  
  if (process.env.MIDTRANS_SERVER_KEY && process.env.MIDTRANS_CLIENT_KEY) {
    snap = new midtransClient.Snap({
      isProduction: false,
      serverKey: process.env.MIDTRANS_SERVER_KEY,
      clientKey: process.env.MIDTRANS_CLIENT_KEY
    });
    console.log("✅ Midtrans Snap initialized successfully");
  } else {
    midtransError = "Environment variables not set";
    console.warn("⚠️ Midtrans environment variables missing");
  }
} catch (error) {
  midtransError = error.message;
  console.error("❌ Failed to initialize Midtrans:", error.message);
}

// ✅ HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    midtrans_configured: !!snap,
    midtrans_error: midtransError,
    env_vars: {
      MIDTRANS_SERVER_KEY: !!process.env.MIDTRANS_SERVER_KEY,
      MIDTRANS_CLIENT_KEY: !!process.env.MIDTRANS_CLIENT_KEY,
      NODE_ENV: process.env.NODE_ENV
    }
  });
});

// ✅ TEST ENDPOINT
app.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Backend is working!',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    midtrans_status: snap ? 'configured' : 'not configured',
    midtrans_error: midtransError
  });
});

// ✅ CHECK ENV
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
    snap_initialized: !!snap,
    midtrans_error: midtransError
  });
});

// ✅ TEST MIDTRANS
app.get("/test-midtrans", async (req, res) => {
  try {
    if (!snap) {
      return res.status(500).json({
        success: false,
        message: "Midtrans not configured",
        error: midtransError || "Unknown error"
      });
    }

    const parameter = {
      transaction_details: {
        order_id: "TEST-" + Date.now(),
        gross_amount: 1000
      },
      item_details: [
        {
          id: "ITEM-1",
          price: 1000,
          quantity: 1,
          name: "Testing Item"
        }
      ],
      customer_details: {
        first_name: "Test User",
        email: "test@example.com",
        phone: "081234567890"
      }
    };

    const transaction = await snap.createTransaction(parameter);

    return res.json({
      success: true,
      message: "Midtrans test successful",
      token: transaction.token,
      redirect_url: transaction.redirect_url
    });

  } catch (error) {
    console.error("❌ MIDTRANS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to test Midtrans",
      error: error.message,
      error_type: error.name
    });
  }
});

// ✅ MAIN SNAP TOKEN ENDPOINT
app.post('/get-snap-token', async (req, res) => {
  try {
    const { transaction_details, item_details, customer_details, discount_total } = req.body;

    if (!transaction_details || !transaction_details.order_id || !transaction_details.gross_amount) {
      return res.status(400).json({
        success: false,
        error: "order_id dan gross_amount wajib dikirim!"
      });
    }

    // ✅ Copy item_details
    let items = Array.isArray(item_details) ? [...item_details] : [];

    // ✅ Tambahkan item diskon negatif agar sum item match gross_amount
    if (discount_total && Number(discount_total) > 0) {
      items.push({
        id: "DISKON",
        name: "Diskon",
        price: -Math.abs(discount_total),
        quantity: 1
      });
    }

    // ✅ Tambahkan logging biar yakin backend menerima diskon
    console.log("==== FINAL MIDTRANS PAYLOAD ====");
    console.log("ITEMS:", items);
    console.log("GROSS:", transaction_details.gross_amount);
    console.log("DISKON:", discount_total);

    const parameter = {
      transaction_details: {
        order_id: transaction_details.order_id,
        gross_amount: parseInt(transaction_details.gross_amount)
      },
      item_details: items,
      customer_details: customer_details || {
        first_name: "Customer",
        email: "customer@example.com",
        phone: "08123456789"
      }
    };

    console.log("🚀 KIRIM KE MIDTRANS:", parameter);

    const transaction = await snap.createTransaction(parameter);

    res.json({
      success: true,
      token: transaction.token,
      redirect_url: transaction.redirect_url
    });

  } catch (error) {
    console.error("❌ MIDTRANS ERROR:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      error_type: error.name
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
    midtrans_configured: !!snap,
    midtrans_error: midtransError
  });
});

// ✅ ERROR HANDLER
app.use((err, req, res, next) => {
  console.error('❌ SERVER ERROR:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    details: err.message,
    timestamp: new Date().toISOString()
  });
});

// ✅ START SERVER
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Midtrans Status: ${snap ? '✅ Configured' : '❌ Not Configured'}`);
  if (midtransError) {
    console.log(`❌ Midtrans Error: ${midtransError}`);
  }
});





