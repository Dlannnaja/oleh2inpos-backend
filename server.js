require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 4000;

// =========================
//  CORS CONFIG
// =========================
const corsOptions = {
  origin: [
    'https://oleh2in-pos-v2.web.app',
    'http://localhost:4200',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// =========================
//  FIREBASE ADMIN
// =========================
const admin = require('firebase-admin');

if (process.env.FIREBASE_ADMIN_CREDENTIAL_BASE64) {
  try {
    const serviceJson = Buffer.from(
      process.env.FIREBASE_ADMIN_CREDENTIAL_BASE64,
      "base64"
    ).toString("utf8");

    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceJson)),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });

    console.log("🔥 Firebase Admin initialized");
  } catch (e) {
    console.error("❌ Firebase Admin failed to init:", e);
  }
} else {
  console.warn("⚠️ FIREBASE_ADMIN_CREDENTIAL_BASE64 missing");
}

// =========================
//  MIDDLEWARE VERIFY TOKEN
// =========================
async function verifyFirebaseIdToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized: Missing Bearer Token"
      });
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);

    req.user = decoded; // uid, email, etc.
    next();
  } catch (error) {
    console.error("❌ Firebase Token Error:", error.message);
    return res.status(401).json({
      success: false,
      error: "Unauthorized: Invalid Firebase Token"
    });
  }
}

// =========================
//  MIDTRANS CONFIG
// =========================
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

    console.log("✅ Midtrans Snap initialized");
  } else {
    midtransError = "Environment variables not set";
    console.warn("⚠️ Midtrans environment variables missing");
  }
} catch (error) {
  midtransError = error.message;
  console.error("❌ Failed to initialize Midtrans:", error.message);
}

// =========================
//  HEALTH CHECK
// =========================
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

// =========================
//  TEST
// =========================
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

// =========================
//  CHECK ENV
// =========================
// Aman → tidak tampilkan preview key lagi
app.get('/check-env', (req, res) => {
  res.json({
    message: 'Checking environment variables on server',
    node_env: process.env.NODE_ENV,
    server_key_exists: !!process.env.MIDTRANS_SERVER_KEY,
    client_key_exists: !!process.env.MIDTRANS_CLIENT_KEY,
    snap_initialized: !!snap,
    midtrans_error: midtransError
  });
});

// =========================
//  TEST MIDTRANS (Proteksi)
// =========================
app.get("/test-midtrans", verifyFirebaseIdToken, async (req, res) => {
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
        { id: "ITEM-1", price: 1000, quantity: 1, name: "Testing Item" }
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

// =========================
//  SNAP TOKEN (Protected + Server-side Validation)
// =========================
app.post('/get-snap-token', verifyFirebaseIdToken, async (req, res) => {
  try {
    if (!snap) {
      return res.status(500).json({
        success: false,
        error: "Midtrans not configured.",
        details: midtransError
      });
    }

    const { transaction_details, item_details, customer_details } = req.body;

    // ====== VALIDASI FIELD WAJIB ======
    if (!transaction_details || !transaction_details.order_id) {
      return res.status(400).json({
        success: false,
        error: "order_id wajib dikirim!"
      });
    }

    if (!Array.isArray(item_details) || item_details.length === 0) {
      return res.status(400).json({
        success: false,
        error: "item_details tidak boleh kosong"
      });
    }

    // ==========================================
    // 🔥 SERVER-SIDE TOTAL VALIDATION (WAJIB)
    // ==========================================
    let serverTotal = 0;

    item_details.forEach(item => {
      const price = Number(item.price);
      const qty = Number(item.quantity || item.qty);

      // Harga dan qty harus valid
      if (isNaN(price) || isNaN(qty)) return;

      // Qty harus integer positif
      if (qty <= 0 || !Number.isInteger(qty)) return;

      // Batas keamanan
      if (price < -100000000 || price > 100000000) return;
      if (qty > 100000) return;

      serverTotal += price * qty;
    });

    // Total tidak boleh negatif
    if (serverTotal < 0) serverTotal = 0;

    console.log("💰 Server calculated total:", serverTotal);

    // Abaikan gross_amount dari client sepenuhnya
    const parameter = {
      transaction_details: {
        order_id: transaction_details.order_id,
        gross_amount: serverTotal
      },
      item_details: item_details,
      customer_details: customer_details || {
        first_name: "Customer",
        email: "customer@example.com",
        phone: "08123456789"
      }
    };

    // Buat transaksi Midtrans
    const transaction = await snap.createTransaction(parameter);

    res.json({
      success: true,
      token: transaction.token,
      redirect_url: transaction.redirect_url,
      server_total: serverTotal
    });

  } catch (error) {
    console.error("❌ MIDTRANS ERROR:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to create transaction",
      error_type: error.name
    });
  }
});

app.post('/verify-access-code', verifyFirebaseIdToken, (req, res) => {
  const { code } = req.body;
  const serverCode = process.env.INDOCART_ACCESS_CODE;

  if (!serverCode) {
    return res.status(500).json({
      success: false,
      message: "Server: Kode akses belum diset."
    });
  }

  if (code === serverCode) {
    return res.json({
      success: true,
      message: "Kode akses benar"
    });
  }

  return res.status(401).json({
    success: false,
    message: "Kode akses salah"
  });
});

// =========================
//  ROOT
// =========================
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

// =========================
//  ERROR HANDLER
// =========================
app.use((err, req, res, next) => {
  console.error('❌ SERVER ERROR:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    details: err.message,
    timestamp: new Date().toISOString()
  });
});

// =========================
//  START SERVER
// =========================
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Midtrans Status: ${snap ? '✅ Configured' : '❌ Not Configured'}`);
  if (midtransError) console.log(`❌ Midtrans Error: ${midtransError}`);
});

