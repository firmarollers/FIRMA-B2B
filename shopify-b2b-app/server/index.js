require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initDatabase } = require('./database/db');

// Import routes
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const customerRoutes = require('./routes/customers');
const pricingRoutes = require('./routes/pricing');
const orderRoutes = require('./routes/orders');
const quoteRoutes = require('./routes/quotes');
const storefrontRoutes = require('./routes/storefront');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
initDatabase();

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files (for storefront integration)
app.use('/storefront', express.static(path.join(__dirname, '../storefront')));

// Routes
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/storefront-api', storefrontRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  if (req.session.shop) {
    res.redirect('/admin');
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>B2B Wholesale Manager</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
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
            a {
              display: inline-block;
              background: #5c6ac4;
              color: white;
              padding: 12px 24px;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 600;
              transition: background 0.3s;
            }
            a:hover { background: #4c5ab4; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🛍️ B2B Wholesale Manager</h1>
            <p>Powerful B2B and wholesale management for your Shopify store</p>
            <a href="/auth/shopify">Install App on Shopify</a>
          </div>
        </body>
      </html>
    `);
  }
});

// Admin dashboard (simplified - in production you'd serve React app here)
// Admin dashboard (simplified - in production you'd serve React app here)
app.get('/admin', (req, res) => {
  const shop = req.session.shop || req.query.shop;
  
  if (!shop) {
    return res.status(400).send('Missing shop parameter. Please add ?shop=your-shop.myshopify.com');
  }
  
  // Save shop to session if not already saved
  if (!req.session.shop && req.query.shop) {
    req.session.shop = req.query.shop;
  }
  
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>B2B Admin Dashboard</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://unpkg.com/@shopify/polaris@11.0.0/build/esm/styles.css" rel="stylesheet">
        <style>
          body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; }
          .header { background: #00848e; color: white; padding: 1rem 2rem; }
          .container { padding: 2rem; }
          .card { background: white; border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
          .stat-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1.5rem; border-radius: 8px; }
          .stat-number { font-size: 2rem; font-weight: bold; margin-bottom: 0.5rem; }
          .stat-label { opacity: 0.9; font-size: 0.9rem; }
          .nav { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
          .nav-button { padding: 0.75rem 1.5rem; background: #5c6ac4; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.9rem; transition: background 0.3s; }
          .nav-button:hover { background: #4c5ab4; }
          .table { width: 100%; border-collapse: collapse; }
          .table th, .table td { padding: 1rem; text-align: left; border-bottom: 1px solid #e1e3e5; }
          .table th { background: #f4f6f8; font-weight: 600; }
          .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85rem; font-weight: 500; }
          .badge-pending { background: #fff4e6; color: #916a00; }
          .badge-approved { background: #d1f4e0; color: #007f5f; }
          .badge-rejected { background: #fed3d1; color: #d72c0d; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🛍️ B2B Wholesale Manager - ${shop}</h1>
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

          <div class="nav">
            <button class="nav-button" onclick="showSection('customers')">B2B Customers</button>
            <button class="nav-button" onclick="showSection('groups')">Customer Groups</button>
            <button class="nav-button" onclick="showSection('pricing')">Pricing Rules</button>
            <button class="nav-button" onclick="showSection('orders')">Orders</button>
            <button class="nav-button" onclick="showSection('quotes')">Quote Requests</button>
            <button class="nav-button" onclick="showSection('settings')">Settings</button>
          </div>

          <div class="card" id="customersSection">
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
                <tr>
                  <td colspan="6" style="text-align: center; padding: 2rem; color: #999;">Loading customers...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <script>
          const API_BASE = '/api';
          
          async function loadDashboardData() {
            try {
              const [customers, groups, stats] = await Promise.all([
                fetch(API_BASE + '/customers').then(r => r.json()),
                fetch(API_BASE + '/groups').then(r => r.json()),
                fetch(API_BASE + '/stats').then(r => r.json())
              ]);

              document.getElementById('totalCustomers').textContent = stats.totalCustomers || 0;
              document.getElementById('pendingApprovals').textContent = stats.pendingApprovals || 0;
              document.getElementById('activeGroups').textContent = stats.activeGroups || 0;
              document.getElementById('totalOrders').textContent = stats.totalOrders || 0;

              renderCustomers(customers);
            } catch (error) {
              console.error('Error loading dashboard:', error);
            }
          }

          function renderCustomers(customers) {
            const tbody = document.querySelector('#customersTable tbody');
            if (!customers || customers.length === 0) {
              tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #999;">No B2B customers yet</td></tr>';
              return;
            }

            tbody.innerHTML = customers.map(customer => \`
              <tr>
                <td><strong>\${customer.name || 'N/A'}</strong></td>
                <td>\${customer.email}</td>
                <td>\${customer.group || 'None'}</td>
                <td><span class="badge badge-\${customer.status}">\${customer.status}</span></td>
                <td>\${new Date(customer.created_at).toLocaleDateString()}</td>
                <td>
                  \${customer.status === 'pending' ? 
                    \`<button class="nav-button" style="padding: 0.5rem 1rem; font-size: 0.85rem;" onclick="approveCustomer('\${customer.id}')">Approve</button>\` : 
                    \`<button class="nav-button" style="padding: 0.5rem 1rem; font-size: 0.85rem;" onclick="viewCustomer('\${customer.id}')">View</button>\`
                  }
                </td>
              </tr>
            \`).join('');
          }

          async function approveCustomer(id) {
            if (!confirm('Approve this B2B customer?')) return;
            try {
              await fetch(\`\${API_BASE}/customers/\${id}/approve\`, { method: 'POST' });
              alert('Customer approved successfully!');
              loadDashboardData();
            } catch (error) {
              alert('Error approving customer: ' + error.message);
            }
          }

          function viewCustomer(id) {
            alert('View customer details (feature coming soon)');
          }

          function showSection(section) {
            alert(\`Showing \${section} section (full UI coming soon)\`);
          }

          // Load data on page load
          loadDashboardData();
        </script>
      </body>
    </html>
  `);
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 B2B Wholesale App running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🏪 Shopify API Key configured: ${!!process.env.SHOPIFY_API_KEY}`);
});

module.exports = app;
