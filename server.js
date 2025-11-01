require('dotenv').config();

const express = require('express');
const cors = require('cors');
const midtransClient = require('midtrans-client');
const app = express();
const port = process.env.PORT || 3000;

// ✅ Middleware CORS yang spesifik (izinkan domain Firebase & lokal)
const allowedOrigins = [
  'https://oleh2in-pos-f5bb3.web.app', // Ganti dengan domain Firebase Hosting Anda
  'http://localhost:5000', // biar bisa test lokal juga
  'http://localhost:3000',
  'http://127.0.0.1:5500' // Untuk Live Server VS Code
];

app.use(cors({
  origin: function (origin, callback) {
    // Kalau origin nggak ada (misal dari Postman), tetap izinkan
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.warn('⛔ Blocked by CORS:', origin);
      return callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ✅ Handle preflight request (OPTIONS)
app.options(/.*/, cors());

// Debug middleware
app.use((req, res, next) => {
  console.log(`🔍 ${req.method} ${req.url}`);
  next();
});

// Midtrans config
const snap = new midtransClient.Snap({
  isProduction: false, // Ganti ke true untuk production
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// API endpoint untuk mendapatkan Snap Token
app.post('/get-snap-token', (req, res) => {
  console.log('🎯 POST /get-snap-token RECEIVED!');
  console.log('📋 Request body:', JSON.stringify(req.body, null, 2));

  const { transaction_details, customer_details, item_details } = req.body;

  // Validasi data
  if (!transaction_details || !transaction_details.order_id || !transaction_details.gross_amount) {
    return res.status(400).json({ error: 'Transaction details are required' });
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
        token: transaction.token,
        redirect_url: transaction.redirect_url
      });
    })
    .catch((error) => {
      console.error('❌ ERROR:', error.message);
      res.status(500).json({ error: error.message });
    });
});

// API endpoint untuk notifikasi dari Midtrans (webhook)
app.post('/midtrans-notification', (req, res) => {
  console.log('🔔 Midtrans notification received:', JSON.stringify(req.body, null, 2));
  
  // Di sini Anda bisa memproses notifikasi pembayaran
  // Misalnya, update status pembayaran di database
  
  res.status(200).json({ status: 'ok' });
});

// ✅ Tambahkan ini biar gak "Cannot GET /"
app.get('/', (req, res) => {
  res.send('🚀 Server Midtrans untuk INDOCART sudah aktif dan siap dipakai!');
});

// Static files PALING AKHIR
app.use(express.static('public'));

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ SERVER ERROR:', err.message);
  res.status(500).send('Something broke!');
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
  console.log(`📱 Open http://localhost:${port} in your browser`);
  console.log(`🔧 Debug mode: ALL requests will be logged`);
});
