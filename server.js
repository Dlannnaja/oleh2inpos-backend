require('dotenv').config();

const express = require('express');
const cors = require('cors');
const midtransClient = require('midtrans-client');
const path = require('path'); // Tambahkan ini

const app = express();
const port = process.env.PORT || 3000;

// ✅ Middleware CORS dan JSON HARUS DI PALING ATAS
const corsOptions = {
  origin: [
    'https://oleh2in-pos-v2.web.app',
    'http://localhost:5000',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://localhost:5173',
    'http://localhost:8080',
    null
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight
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

// ✅ SEMUA ROUTE API DIDEFINISIKAN DI SINI
app.get('/check-env', (req, res) => { /* ... kode Anda ... */ });
app.get('/test-midtrans', (req, res) => { /* ... kode Anda ... */ });
app.post('/get-snap-token', async (req, res) => { /* ... kode Anda yang sudah diperbaiki ... */ });
app.get('/', (req, res) => { /* ... kode Anda ... */ });

// ✅ SERVE FILE STATIK PALING AKHIR
// Ini akan melayani file dari folder 'public' DAN berfungsi sebagai fallback untuk SPA
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all handler: kirim index.html untuk rute lain yang tidak dikenal (untuk SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler PALING AKHIR
app.use((err, req, res, next) => {
  console.error('❌ SERVER ERROR:', err.message);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error'
  });
});

// ✅ TAMBAHKAN ENDPOINT TES INI
app.get('/am-i-updated', (req, res) => {
  res.send('YES, THE SERVER IS UPDATED WITH THE LATEST CODE!');
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});

