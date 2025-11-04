// ✅ SEMUA ROUTE API DIDEFINISIKAN DI SINI
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

app.post('/get-snap-token', async (req, res) => {
  // ... (kode endpoint Anda yang sudah lengkap)
});

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

// ✅ TAMBAHKAN ENDPOINT TES INI SEBELUM CATCH-ALL
app.get('/am-i-updated', (req, res) => {
  res.send('YES, THE SERVER IS UPDATED WITH THE LATEST CODE!');
});


// ✅ SERVE FILE STATIK PALING AKHIR
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

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
