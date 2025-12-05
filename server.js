require('dotenv').config();
const express = require('express');
const cors = require('cors');

// =========================
//  INIT APP
// =========================
const app = express();

// FIX WAJIB UNTUK RENDER: proxy IP tetap akurat
app.set("trust proxy", 1);

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
//  SECURITY MIDDLEWARES
// =========================
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// Add secure HTTP headers
app.use(helmet());

// Global limiter (untuk seluruh request)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

// Limiter khusus endpoint sensitif
const sensitiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: "Too many requests, try again later" }
});

// =========================
//  FIREBASE ADMIN
// =========================
const admin = require("firebase-admin");

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_JSON);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });

    console.log("🔥 Firebase Admin initialized");
  } catch (e) {
    console.error("❌ Firebase Admin init failed:", e);
  }
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

    req.user = decoded;
    next();
  } catch (error) {
    console.error("❌ Firebase Token Error:", error.message);
    return res.status(401).json({
      success: false,
      error: "Unauthorized: Invalid Firebase Token"
    });
  }
}

function verifyRole(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      const uid = req.user?.uid;
      if (!uid) {
        return res.status(401).json({ success:false, error:"Unauthorized: no UID" });
      }

      const snap = await admin.database().ref("accounts/" + uid).once("value");
      const data = snap.val();

      if (!data || !data.role) {
        return res.status(403).json({ success:false, error:"Role tidak ditemukan" });
      }

      const userRole = String(data.role).toLowerCase();
      const allowed = allowedRoles.map(r => r.toLowerCase());

      if (!allowed.includes(userRole)) {
        return res.status(403).json({
          success:false,
          error:`Akses ditolak untuk role '${userRole}'`
        });
      }

      next();

    } catch (err) {
      console.error("verifyRole ERROR:", err);
      return res.status(500).json({
        success:false,
        error:"Server error during role verification"
      });
    }
  };
}

app.post('/product/add',
  sensitiveLimiter,
  verifyFirebaseIdToken,
  verifyRole(['owner', 'admin']),
  async (req, res) => {

    const { sku, name, price, qty, category } = req.body;

    if (!sku || !name || !price || !qty) {
      return res.status(400).json({ success:false, error:"Data tidak lengkap" });
    }

    await admin.database().ref(`products/${sku}`).set({
      name,
      price,
      qty,
      category,
      updated_at: Date.now()
    });

    res.json({ success:true, message:"Produk berhasil ditambahkan" });
});

app.post('/product/restock',
  sensitiveLimiter,
  verifyFirebaseIdToken,
  verifyRole(['owner', 'admin']),
  async (req, res) => {

    const { sku, qty } = req.body;

    if (!sku || !qty) {
      return res.status(400).json({ success:false, error:"Data tidak lengkap" });
    }

    const productRef = admin.database().ref(`products/${sku}`);
    const snap = await productRef.once("value");

    if (!snap.exists()) {
      return res.status(404).json({ success:false, error:"Produk tidak ditemukan" });
    }

    const current = snap.val().qty || 0;

    await productRef.update({
      qty: current + qty,
      updated_at: Date.now()
    });

    res.json({ success:true, message:"Stok berhasil ditambahkan" });
});

app.post('/sales/add',
  sensitiveLimiter,
  verifyFirebaseIdToken,
  verifyRole(['kasir']),
  async (req, res) => {

    const sale = req.body;
    const id = "INV-" + Date.now();

    // Kurangi stok
    for (const item of sale.items) {

      const productRef = admin.database().ref(`products/${item.sku}`);
      const snap = await productRef.once("value");

      if (!snap.exists()) continue;

      const current = snap.val().qty || 0;
      const newQty = Math.max(0, current - item.qty);

      await productRef.update({
        qty: newQty,
        updated_at: Date.now()
      });
    }

    // Simpan transaksi
    await admin.database().ref(`sales/${id}`).set(sale);

    res.json({ success:true, id });
});


app.post('/report/clear',
  sensitiveLimiter,
  verifyFirebaseIdToken,
  verifyRole(['owner']),
  async (req, res) => {

    await admin.database().ref("sales").remove();

    res.json({ success:true, message:"Laporan berhasil dihapus" });
});


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
    midtrans_error: midtransError
  });
});

// =========================
//  TEST ENDPOINT
// =========================
app.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Backend is working!',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    midtrans_status: snap ? 'configured' : 'not configured'
  });
});

// =========================
//  CHECK ENV (AMAN)
// =========================
app.get('/check-env', (req, res) => {
  res.json({
    message: 'Checking environment variables on server',
    node_env: process.env.NODE_ENV,
    server_key_exists: !!process.env.MIDTRANS_SERVER_KEY,
    client_key_exists: !!process.env.MIDTRANS_CLIENT_KEY,
    snap_initialized: !!snap
  });
});

// =========================
//  TEST MIDTRANS (Protected)
// =========================
app.get("/test-midtrans", sensitiveLimiter, verifyFirebaseIdToken, async (req, res) => {
  try {
    if (!snap) {
      return res.status(500).json({
        success: false,
        message: "Midtrans not configured",
        error: midtransError
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
      error: error.message
    });
  }
});

// =========================
//  SNAP TOKEN (Protected + Validation + Rate Limit)
// =========================
app.post('/get-snap-token', sensitiveLimiter, verifyFirebaseIdToken, async (req, res) => {
  try {
    if (!snap) {
      return res.status(500).json({
        success: false,
        error: "Midtrans not configured.",
        details: midtransError
      });
    }

    const { transaction_details, item_details, customer_details } = req.body;

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

    let serverTotal = 0;

    item_details.forEach(item => {
      const price = Number(item.price);
      const qty = Number(item.quantity || item.qty);

      if (isNaN(price) || isNaN(qty)) return;
      if (qty <= 0 || !Number.isInteger(qty)) return;

      if (price < -100000000 || price > 100000000) return;
      if (qty > 100000) return;

      serverTotal += price * qty;
    });

    if (serverTotal < 0) serverTotal = 0;

    console.log("💰 Server calculated total:", serverTotal);

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
      error: error.message
    });
  }
});

app.post('/verify-access-code', sensitiveLimiter, (req, res) => {
  const { code } = req.body;
  
  const serverCode = process.env.INDOCART_ACCESS_CODE;

  if (!serverCode) {
    return res.status(500).json({
      success: false,
      message: "Server: Kode akses belum diset."
    });
  }

  if (code === serverCode) {
    return res.json({ success: true });
  } else {
    return res.status(401).json({
      success: false,
      message: "Kode akses salah."
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'active',
    message: '🚀 INDOCART Backend Server is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    midtrans_configured: !!snap
  });
});

app.post("/signup", sensitiveLimiter, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Data tidak lengkap"
      });
    }

    // 1. Buat akun Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password
    });

    const uid = userRecord.uid;

    // 2. Simpan data akun ke Realtime Database
    await admin.database().ref("accounts/" + uid).set({
      name,
      email,
      role,
      created_at: Date.now()
    });

    return res.json({ success: true, uid });

  } catch (err) {
    console.error("❌ SIGNUP ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

app.use((err, req, res, next) => {
  console.error('❌ SERVER ERROR:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    details: err.message,
    timestamp: new Date().toISOString()
  });
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Midtrans Status: ${snap ? '✅ Configured' : '❌ Not Configured'}`);
});



