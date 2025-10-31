require('dotenv').config();

const express = require('express');
const cors = require('cors');
const midtransClient = require('midtrans-client');
const app = express();
const port = 3000;

// ✅ Middleware CORS yang spesifik (izinkan domain Firebase & lokal)
const allowedOrigins = [
  'https://oleh2in-pos-f5bb3.web.app',
  'http://localhost:5000', // biar bisa test lokal juga
  'http://localhost:3000'
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
  isProduction: false,
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// API endpoint
app.post('/get-snap-token', (req, res) => {
  console.log('🎯 POST /get-snap-token RECEIVED!');
  console.log('📋 Request body:', JSON.stringify(req.body, null, 2));

  const { transaction_details, customer_details, item_details } = req.body;

  const parameter = {
    transaction_details,
    customer_details,
    item_details
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

// Static files PALING AKHIR
app.use(express.static('.'));

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
