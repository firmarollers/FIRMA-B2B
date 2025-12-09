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

  // Extract myshopify.com domain if custom domain is used
  let shopDomain = shop;
  if (!shop.includes('.myshopify.com')) {
    // If it's a custom domain, we need the myshopify.com equivalent
    // For now, we'll let Shopify handle it
    shopDomain = shop;
  }

  const state = crypto.randomBytes(16).toString('hex');
  
  // Use the EXACT callback URL that's in Shopify Partners
  const redirectUri = `https://${HOST}/auth/callback`;
  
  const installUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SCOPES}&state=${state}&redirect_uri=${redirectUri}`;

  // Store state and shop in session
  req.session.state = state;
  req.session.shop = shopDomain;
  
  // Force session save before redirect
  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
      return res.status(500).send('Session error. Please try again.');
    }
    
    console.log('✅ Redirecting to Shopify OAuth for shop:', shopDomain);
    console.log('✅ Redirect URI:', redirectUri);
    res.redirect(installUrl);
  });
});

// OAuth callback - This URL MUST match exactly what's in Shopify Partners
router.get('/callback', async (req, res) => {
  const { shop, code, state, hmac } = req.query;

  console.log('✅ OAuth callback received for shop:', shop);

  // Verify state
  if (state !== req.session.state) {
    console.error('❌ State mismatch');
    return res.status(403).send('Request origin cannot be verified. Please try installing again.');
  }

  if (!shop || !code) {
    console.error('❌ Missing shop or code');
    return res.status(400).send('Required parameters missing');
  }

  try {
    console.log('🔄 Exchanging code for access token...');
    
    // Exchange code for access token
    const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code
    });

    const { access_token, scope } = response.data;
    
    console.log('✅ Access token received');

    // Store session in database
    const db = getDatabase();
    const sessionId = crypto.randomBytes(16).toString('hex');
    
    db.prepare(`
      INSERT OR REPLACE INTO sessions (id, shop, state, accessToken, scope, isOnline)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, shop, state, access_token, scope, 0);

    // Store in session
    req.session.shop = shop;
    req.session.accessToken = access_token;
    req.session.sessionId = sessionId;

    console.log('✅ Session saved, redirecting to admin...');

    // IMPORTANT: Save session before redirect
    req.session.save((err) => {
      if (err) {
        console.error('❌ Session save error:', err);
        return res.status(500).send('Session error');
      }

      // Register webhooks in background
      registerWebhooks(shop, access_token).catch(console.error);

      // Redirect to admin with shop parameter
      const adminUrl = `/admin?shop=${shop}`;
      console.log('✅ Redirecting to:', adminUrl);
      
      // Use Shopify's redirect format for embedded apps
      res.redirect(adminUrl);
    });

  } catch (error) {
    console.error('❌ OAuth error:', error.response?.data || error.message);
    res.status(500).send(`Authentication failed: ${error.response?.data?.error_description || error.message}. Please try again.`);
  }
});

// Alternative callback for Shopify - some versions use this
router.get('/shopify/callback', (req, res) => {
  console.log('✅ Received callback at /auth/shopify/callback, redirecting to /auth/callback');
  // Redirect to main callback with all
