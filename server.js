require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 4000;

// =========================
// CORS CONFIG
// =========================
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

// =========================
// MIDTRANS INIT
// =========================
let snap = null;
let midtransError = null;

try {
  const midtransClient = require('midtrans-client');

  if (process.env.MIDTRANS_SERVER_KEY && process.env.MIDTRANS_CLIENT_KEY) {
    snap = new midtransClient.Snap({
      isProduction: false,
      serverKey: process.env.MIDTRANS_SERVER_KEY,
      clientKey: process.env.MIDTRANS_CLIENT_KEY,
    });

    console.log("✅ Midtrans Snap initialized successfully");
  } else {
    midtransError = "Environment variables missing";
    console.warn("⚠️ Midtrans environment variables missing");
  }
} catch (error) {
  midtransError = error.message;
  console.error("❌ Failed to initialize Midtrans:", error.message);
}

// =========================
// HEALTH CHECK
// =========================
app.get('/health', (req, res) => {
  res.json({
    status: "healthy",
    midtrans_configured: !!snap,
    midtrans_error: midtransError,
    timestamp: new Date().toISOString()
  });
});

// =========================
// TEST ENDPOINT
// =========================
app.get('/test', (req, res) => {
  res.json({
    success: true,
    message: "Backend working",
    timestamp: new Date().toISOString()
  });
});

// =========================
// GET SNAP TOKEN
// =========================
app.post('/get-snap-token', async (req, res) => {
  try {
    if (!snap) {
      return res.status(500).json({
        success: false,
        error: "Midtrans not configured",
        details: midtransError
      });
    }

    const { transaction_details, item_details, customer_details } = req.body;

    if (!transaction_details || !transaction_details.order_id) {
      return res.status(400).json({
        success: false,
        error: "order_id dan gross_amount wajib dikirim!"
      });
    }

    const parameter = {
      transaction_details: {
        order_id: transaction_details.order_id,
        gross_amount: parseInt(transaction_details.gross_amount)
      },
      item_details: item_details || [],
      customer_details: customer_details || {
        first_name: "Customer",
        email: "customer@example.com",
        phone: "08123456789"
      }
    };

    const transaction = await snap.createTransaction(parameter);

    res.json({
      success: true,
      token: transaction.token
    });

  } catch (error) {
    console.error("❌ MIDTRANS ERROR:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =========================
// PAY.HTML SERVE
// =========================
app.get(['/pay', '/pay.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'pay.html'));
});

// =========================
// QR PAYMENT MODE STORAGE
// =========================
let qrTransactionMap = {};   // order_id -> token
let paymentStatusMap = {};   // token -> {status, result}

// =========================
// UPDATE STATUS (HP → BACKEND)
// =========================
app.post('/payment-status', (req, res) => {
  const { token, status, result } = req.body;

  paymentStatusMap[token] = {
    status,
    result: result || null
  };

  res.json({ success: true });
});

app.post("/save-qr-transaction", (req, res) => {
  const { order_id, token } = req.body;

  if (!order_id || !token) {
    return res.status(400).json({ error: "Missing order_id or token" });
  }

  qrTransactionMap[order_id] = token;
  res.json({ success: true });
});


// =========================
// PC POLLING PAYMENT STATUS
// =========================
app.get('/payment-status/:token', (req, res) => {
  const token = req.params.token;
  const entry = paymentStatusMap[token];

  if (!entry) {
    return res.json({ status: "pending", result: null });
  }

  res.json({
    status: entry.status,
    result: entry.result
  });
});

// =========================
// MIDTRANS FINISH CALLBACK
// =========================
app.get('/midtrans-finish', (req, res) => {
  const orderId = req.query.order_id;
  const transactionStatus = req.query.transaction_status;

  const isPC = qrTransactionMap[orderId];

  if (isPC) {
    const token = qrTransactionMap[orderId];

    paymentStatusMap[token] = {
      status: "success",
      result: {
        order_id: orderId,
        transaction_status: transactionStatus,
        via: "midtrans-finish"
      }
    };

    delete qrTransactionMap[orderId];
    return res.redirect("about:blank");
  }

  // HP MODE
  return res.redirect(`https://oleh2in-pos-v2.web.app/finish?order_id=${orderId}&status=${transactionStatus}`);
});

// =========================
// DEFAULT ROUTE
// =========================
app.get('/', (req, res) => {
  res.json({
    status: "running",
    midtrans: !!snap,
    timestamp: new Date().toISOString()
  });
});

// =========================
// START SERVER
// =========================
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

