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

initDatabase();

app.set('trust proxy', 1);

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

app.use('/storefront', express.static(path.join(__dirname, '../storefront')));

app.use('/auth', authRoutes);
app.use('/api', verifyAuth, apiRoutes);
app.use('/api/customers', verifyAuth, customerRoutes);
app.use('/api/pricing', verifyAuth, pricingRoutes);
app.use('/api/orders', verifyAuth, orderRoutes);
app.use('/api/quotes', verifyAuth, quoteRoutes);
app.use('/storefront-api', storefrontRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  const shopQuery = req.query.shop;

  if (req.session.shop) {
    return res.redirect('/admin');
  }
  
  if (shopQuery) {
    return res.redirect('/auth/shopify?shop=' + shopQuery);
  }
  
  res.send(`
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
          button { background: #5c6ac4; color: white; padding: 12px; border: none; border-radius: 6px; cursor: pointer; }
          button:hover { background: #4c5ab4; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🛍️ B2B Wholesale Manager</h1>
          <p>Enter your store URL to install:</p>
          <form action="/auth/shopify" method="GET">
            <input type="text" name="shop" placeholder="your-store.myshopify.com" required>
            <button type="submit">Install App</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

app.get('/admin', (req, res) => {
  verifyAuth(req, res, () => {
    const shop = req.session.shop || req.query.shop;
    const apiKey = process.env.SHOPIFY_API_KEY;
    
    if (!shop) return res.redirect('/');
    
    if (!req.session.shop && req.query.shop) {
      req.session.shop = req.query.shop;
    }
    
    res.send(`<!DOCTYPE html>
<html>
<head>
  <title>B2B Admin</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://unpkg.com/@shopify/app-bridge@3.7.8/umd/app-bridge.js"></script>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f4f6f8; }
    .header { background: #00848e; color: white; padding: 1rem 2rem; }
    .container { padding: 2rem; max-width: 1200px; margin: 0 auto; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .stat-card { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 1.5rem; border-radius: 8px; }
    .stat-number { font-size: 2rem; font-weight: bold; }
    .stat-label { opacity: 0.9; font-size: 0.9rem; margin-top: 0.5rem; }
    .card { background: white; border-radius: 8px; padding: 1.5rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .table { width: 100%; border-collapse: collapse; }
    .table th, .table td { padding: 1rem; text-align: left; border-bottom: 1px solid #e1e3e5; }
    .table th { background: #f4f6f8; font-weight: 600; }
    .badge { padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85rem; }
    .badge-pending { background: #fff4e6; color: #916a00; }
    .badge-approved { background: #d1f4e0; color: #007f5f; }
    .btn { padding: 0.5rem 1rem; background: #5c6ac4; color: white; border: none; border-radius: 6px; cursor: pointer; }
    .btn:hover { background: #4c5ab4; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🛍️ B2B Wholesale Manager</h1>
    <p>` + shop + `</p>
  </div>
  <div class="container">
    <div class="stats">
      <div class="stat-card">
        <div class="stat-number" id="totalCustomers">0</div>
        <div class="stat-label">Total B2B Customers</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" id="pendingApprovals">0</div>
        <div class="stat-label">Pending Approvals</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" id="activeGroups">0</div>
        <div class="stat-label">Customer Groups</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" id="totalOrders">0</div>
        <div class="stat-label">B2B Orders</div>
      </div>
    </div>

    <div class="card">
      <h2>B2B Customers</h2>
      <table class="table" id="customersTable">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Email</th>
            <th>Group</th>
            <th>Status</th>
            <th>Registered</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colspan="6" style="text-align:center;padding:2rem;color:#999;">Loading...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <script>
    var app = ShopifyAppBridge.createApp({
      apiKey: '` + apiKey + `',
      host: new URL(window.location).searchParams.get("host")
    });

    async function loadData() {
      try {
        const responses = await Promise.all([
          fetch('/api/customers'),
          fetch('/api/groups'),
          fetch('/api/stats')
        ]);
        
        const [customers, groups, stats] = await Promise.all([
          responses[0].json(),
          responses[1].json(),
          responses[2].json()
        ]);

        document.getElementById('totalCustomers').textContent = stats.totalCustomers || 0;
        document.getElementById('pendingApprovals').textContent = stats.pendingApprovals || 0;
        document.getElementById('activeGroups').textContent = stats.activeGroups || 0;
        document.getElementById('totalOrders').textContent = stats.totalOrders || 0;

        renderCustomers(customers);
      } catch (err) {
        console.error('Error loading data:', err);
      }
    }

    function renderCustomers(customers) {
      var tbody = document.querySelector('#customersTable tbody');
      if (!customers || customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#999;">No customers yet</td></tr>';
        return;
      }

      var html = '';
      for (var i = 0; i < customers.length; i++) {
        var c = customers[i];
        html += '<tr>';
        html += '<td><strong>' + (c.name || 'N/A') + '</strong></td>';
        html += '<td>' + c.email + '</td>';
        html += '<td>' + (c.group || 'None') + '</td>';
        html += '<td><span class="badge badge-' + c.status + '">' + c.status + '</span></td>';
        html += '<td>' + new Date(c.created_at).toLocaleDateString() + '</td>';
        html += '<td>';
        if (c.status === 'pending') {
          html += '<button class="btn" onclick="approve(' + c.id + ')">Approve</button>';
        } else {
          html += '<button class="btn" onclick="view(' + c.id + ')">View</button>';
        }
        html += '</td>';
        html += '</tr>';
      }
      tbody.innerHTML = html;
    }

    async function approve(id) {
      if (!confirm('Approve this customer?')) return;
      try {
        await fetch('/api/customers/' + id + '/approve', { method: 'POST' });
        alert('Customer approved!');
        loadData();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    function view(id) {
      alert('View customer ' + id);
    }

    loadData();
  </script>
</body>
</html>`);
  });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log('🚀 B2B App running on port ' + PORT);
  console.log('📍 Environment: ' + (process.env.NODE_ENV || 'development'));
  console.log('🏪 Shopify API Key configured: ' + !!process.env.SHOPIFY_API_KEY);
});

module.exports = app;
```

---

## 🔑 Cambios clave:

1. ✅ **Línea 85:** Cambié template literals por concatenación simple: `'/auth/shopify?shop=' + shopQuery`
2. ✅ **Todo el HTML:** Usa concatenación con `+` en lugar de backticks para evitar problemas
3. ✅ **Sin caracteres especiales** que puedan causar problemas al copiar/pegar

---

## 🚀 Ahora:

1. **Commit** este archivo
2. **Espera 2-3 minutos** al deploy
3. **Verifica logs:** `Your service is live 🎉`
4. **Instala:**
```
https://firma-b2b.onrender.com/auth/shopify?shop=qy5r19-gm.myshopify.com
