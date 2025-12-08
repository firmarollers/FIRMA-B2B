const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const { getDatabase } = require('../database/db');

const router = express.Router();

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SCOPES = process.env.SCOPES || 'read_products,write_products,read_customers,write_customers,read_orders,write_orders,read_price_rules,write_price_rules';
const HOST = process.env.HOST || 'localhost:3000';

// Generate install URL
router.get('/shopify', (req, res) => {
  const shop = req.query.shop;

  if (!shop) {
    return res.status(400).send('Missing shop parameter. Please add ?shop=your-shop.myshopify.com');
  }

  // Validate shop domain
  if (!shop.match(/^[a-z0-9][a-z0-9\-]*\.myshopify\.com$/i)) {
    return res.status(400).send('Invalid shop domain');
  }

  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = `https://${HOST}/auth/callback`;
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SCOPES}&state=${state}&redirect_uri=${redirectUri}`;

  // Store state and shop in session
  req.session.state = state;
  req.session.shop = shop;

  res.redirect(installUrl);
});

// OAuth callback
router.get('/callback', async (req, res) => {
  const { shop, code, state } = req.query;

  // Verify state
  if (state !== req.session.state) {
    return res.status(403).send('Request origin cannot be verified');
  }

  if (!shop || !code) {
    return res.status(400).send('Required parameters missing');
  }

  try {
    // Exchange code for access token
    const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code
    });

    const { access_token, scope } = response.data;

    // Store session in database
    const db = getDatabase();
    const sessionId = crypto.randomBytes(16).toString('hex');
    
    db.prepare(`
      INSERT INTO sessions (id, shop, state, accessToken, scope, isOnline)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET 
        accessToken = ?,
        scope = ?,
        expires = datetime('now', '+1 day')
    `).run(sessionId, shop, state, access_token, scope, 0, access_token, scope);

    // Store in session
    req.session.shop = shop;
    req.session.accessToken = access_token;
    req.session.sessionId = sessionId;

    // IMPORTANT: Save session before redirect
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).send('Session error');
      }

      // Register webhooks
      registerWebhooks(shop, access_token).catch(console.error);

      // Redirect to admin dashboard with shop parameter
      res.redirect(`/admin?shop=${shop}`);
    });

  } catch (error) {
    console.error('OAuth error:', error.response?.data || error.message);
    res.status(500).send('Authentication failed. Please try again.');
  }
});

// Register important webhooks
async function registerWebhooks(shop, accessToken) {
  const webhooks = [
    {
      topic: 'orders/create',
      address: `https://${HOST}/webhooks/orders/create`
    },
    {
      topic: 'customers/create',
      address: `https://${HOST}/webhooks/customers/create`
    },
    {
      topic: 'customers/update',
      address: `https://${HOST}/webhooks/customers/update`
    }
  ];

  for (const webhook of webhooks) {
    try {
      await axios.post(
        `https://${shop}/admin/api/2024-01/webhooks.json`,
        { webhook },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`✅ Registered webhook: ${webhook.topic}`);
    } catch (error) {
      // Webhook might already exist
      if (error.response?.status !== 422) {
        console.error(`Error registering webhook ${webhook.topic}:`, error.response?.data || error.message);
      }
    }
  }
}

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Middleware to verify authentication
function verifyAuth(req, res, next) {
  const shop = req.session.shop || req.query.shop;
  
  if (!shop || !req.session.accessToken) {
    // Redirect to install if not authenticated
    if (shop) {
      return res.redirect(`/auth/shopify?shop=${shop}`);
    }
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  // Add shop to request for convenience
  req.shop = shop;
  next();
}

module.exports = router;
module.exports.verifyAuth = verifyAuth;
