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
    console.log('Data directory created');
  } catch (e) {
    console.error('Could not create data directory:', e);
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
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  name: 'sid',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 86400000,
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

app.get('/health', function(req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', function(req, res) {
  var shopQuery = req.query.shop;
  if (req.session.shop) {
    return res.redirect('/admin');
  }
  if (shopQuery) {
    return res.redirect('/auth/shopify?shop=' + shopQuery);
  }
  res.send('<!DOCTYPE html><html><head><title>B2B Wholesale Manager</title><style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:linear-gradient(135deg,#667eea,#764ba2)}.container{background:#fff;padding:3rem;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.2);text-align:center;max-width:400px}h1{color:#333;margin-bottom:1rem}p{color:#666;margin-bottom:2rem}form{display:flex;flex-direction:column}input{padding:10px;margin-bottom:15px;border:1px solid #ccc;border-radius:6px}button{background:#5c6ac4;color:#fff;padding:12px;border:none;border-radius:6px;cursor:pointer}button:hover{background:#4c5ab4}</style></head><body><div class="container"><h1>🛍️ B2B Wholesale Manager</h1><p>Enter your store URL to install:</p><form action="/auth/shopify" method="GET"><input type="text" name="shop" placeholder="your-store.myshopify.com" required><button type="submit">Install App</button></form></div></body></html>');
});

app.get('/admin', function(req, res) {
  verifyAuth(req, res, function() {
    var shop = req.session.shop || req.query.shop;
    var apiKey = process.env.SHOPIFY_API_KEY;
    if (!shop) return res.redirect('/');
    if (!req.session.shop && req.query.shop) {
      req.session.shop = req.query.shop;
    }
    res.send('<!DOCTYPE html><html><head><title>B2B Admin</title><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://unpkg.com/@shopify/app-bridge@3.7.8/umd/app-bridge.js"></script><style>body{margin:0;font-family:system-ui,sans-serif;background:#f4f6f8}.header{background:#00848e;color:#fff;padding:1rem 2rem}.container{padding:2rem;max-width:1200px;margin:0 auto}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:2rem}.stat-card{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:1.5rem;border-radius:8px}.stat-number{font-size:2rem;font-weight:700}.stat-label{opacity:.9;font-size:.9rem;margin-top:.5rem}.card{background:#fff;border-radius:8px;padding:1.5rem;box-shadow:0 2px 4px rgba(0,0,0,.1)}.table{width:100%;border-collapse:collapse}.table td,.table th{padding:1rem;text-align:left;border-bottom:1px solid #e1e3e5}.table th{background:#f4f6f8;font-weight:600}.badge{padding:.25rem .75rem;border-radius:12px;font-size:.85rem}.badge-pending{background:#fff4e6;color:#916a00}.badge-approved{background:#d1f4e0;color:#007f5f}.btn{padding:.5rem 1rem;background:#5c6ac4;color:#fff;border:none;border-radius:6px;cursor:pointer}.btn:hover{background:#4c5ab4}</style></head><body><div class="header"><h1>🛍️ B2B Wholesale Manager</h1><p>' + shop + '</p></div><div class="container"><div class="stats"><div class="stat-card"><div class="stat-number" id="totalCustomers">0</div><div class="stat-label">Total B2B Customers</div></div><div class="stat-card"><div class="stat-number" id="pendingApprovals">0</div><div class="stat-label">Pending Approvals</div></div><div class="stat-card"><div class="stat-number" id="activeGroups">0</div><div class="stat-label">Customer Groups</div></div><div class="stat-card"><div class="stat-number" id="totalOrders">0</div><div class="stat-label">B2B Orders</div></div></div><div class="card"><h2>B2B Customers</h2><table class="table" id="customersTable"><thead><tr><th>Customer</th><th>Email</th><th>Group</th><th>Status</th><th>Registered</th><th>Actions</th></tr></thead><tbody><tr><td colspan="6" style="text-align:center;padding:2rem;color:#999">Loading...</td></tr></tbody></table></div></div><script>var app=ShopifyAppBridge.createApp({apiKey:"' + apiKey + '",host:new URL(window.location).searchParams.get("host")});async function loadData(){try{const e=await Promise.all([fetch("/api/customers"),fetch("/api/groups"),fetch("/api/stats")]),t=await Promise.all([e[0].json(),e[1].json(),e[2].json()]);document.getElementById("totalCustomers").textContent=t[2].totalCustomers||0,document.getElementById("pendingApprovals").textContent=t[2].pendingApprovals||0,document.getElementById("activeGroups").textContent=t[2].activeGroups||0,document.getElementById("totalOrders").textContent=t[2].totalOrders||0,renderCustomers(t[0])}catch(e){console.error("Error:",e)}}function renderCustomers(e){var t=document.querySelector("#customersTable tbody");if(!e||0===e.length)return void(t.innerHTML=\'<tr><td colspan="6" style="text-align:center;padding:2rem;color:#999">No customers yet</td></tr>\');for(var n="",r=0;r<e.length;r++){var o=e[r];n+="<tr>",n+="<td><strong>"+(o.name||"N/A")+"</strong></td>",n+="<td>"+o.email+"</td>",n+="<td>"+(o.group||"None")+"</td>",n+=\'<td><span class="badge badge-\'+o.status+\'">\'+o.status+"</span></td>",n+="<td>"+new Date(o.created_at).toLocaleDateString()+"</td>",n+="<td>","pending"===o.status?n+=\'<button class="btn" onclick="approve(\'+o.id+\')">\'+\'Approve</button>\':n+=\'<button class="btn" onclick="view(\'+o.id+\')">View</button>\',n+="</td>",n+="</tr>"}t.innerHTML=n}async function approve(e){if(confirm("Approve this customer?"))try{await fetch("/api/customers/"+e+"/approve",{method:"POST"}),alert("Customer approved!"),loadData()}catch(e){alert("Error: "+e.message)}}function view(e){alert("View customer "+e)}loadData()</script></body></html>');
  });
});

app.use(function(err, req, res, next) {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, function() {
  console.log('B2B App running on port ' + PORT);
  console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
  console.log('Shopify API Key configured: ' + !!process.env.SHOPIFY_API_KEY);
});

module.exports = app;
