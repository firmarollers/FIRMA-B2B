require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const { initDatabase } = require('./database/db');

const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const customerRoutes = require('./routes/customers');
const pricingRoutes = require('./routes/pricing');
const orderRoutes = require('./routes/orders');
const quoteRoutes = require('./routes/quotes');
const storefrontRoutes = require('./routes/storefront');
const { verifyAuth } = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Create data directory if it doesn't exist
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('✅ Data directory created');
  } catch (e) {
    console.error('❌ Could not create data directory:', e);
    process.exit(1);
  }
}

// Initialize database
initDatabase();

// Trust proxy (for Render HTTPS)
app.set('trust proxy', 1);

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  name: 'sid',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'none'
  }
}));

// Serve static files
app.use('/storefront', express.static(path.join(__dirname, '../storefront')));

// Routes
app.use('/auth', authRoutes);
app.use('/api', verifyAuth, apiRoutes);
app.use('/api/customers', verifyAuth, customerRoutes);
app.use('/api/pricing', verifyAuth, pricingRoutes);
app.use('/api/orders', verifyAuth, orderRoutes);
app.use('/api/quotes', verifyAuth, quoteRoutes);
app.use('/storefront-api', storefrontRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  const shopQuery = req.query.shop;

  if (req.session.shop) {
    return res.redirect('/admin');
  }
  
  if (shopQuery) {
    return res.redirect(\`/auth/shopify?shop=\${shopQuery}\`);
  }
  
  res.send(\`
    <!DOCTYPE html>
    <html>
      <head>
        <title>B2B Wholesale Manager</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container {
            background: white;
            padding: 3rem;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            text-align: center;
            max-width: 400px;
          }
          h1 { color: #333; margin-bottom: 1rem; }
          p { color: #666; margin-bottom: 2rem; }
          form { display: flex; flex-direction: column; }
          input { padding: 10px; margin-bottom: 15px; border: 1px solid #ccc; border-radius: 6px; }
          button { background:
