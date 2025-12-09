const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const { getDatabase } = require('../database/db');

const router = express.Router();

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SCOPES = process.env.SCOPES || 'read_products,write_products,read_customers,write_customers,read_orders,write_orders';
const HOST = process.env.HOST || 'localhost:3000'; 

// 1. Ruta de inicio de la autenticación (Inicia el flujo OAuth)
router.get('/shopify', (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).send('Missing shop parameter. Please add ?shop=your-shop.myshopify.com');
  }

  const state = crypto.randomBytes(16).toString('hex');
  // URL de redirección configurada en Shopify Partners
  const redirectUri = `https://${HOST}/auth/callback`; 
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SCOPES}&state=${state}&redirect_uri=${redirectUri}`;

  req.session.state = state;
  req.session.shop = shop;
  
  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
      return res.status(500).send('Session error');
    }
    console.log('Redirecting to Shopify OAuth for:', shop);
    res.redirect(installUrl);
  });
});

// 2. Ruta de callback (Recibe el código y lo intercambia por el Access Token)
router.get('/callback', async (req, res) => {
  const { shop, code, state } = req.query;
  
  console.log('OAuth callback for shop:', shop);

  if (state !== req.session.state) {
    return res.status(403).send('Request origin cannot be verified');
  }

  if (!shop || !code) {
    return res.status(400).send('Required parameters missing');
  }

  try {
    // Intercambio del código temporal por el Access Token permanente
    const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code
    });

    const { access_token, scope } = response.data;
    
    // Guarda la sesión en la base de datos
    const db = getDatabase();
    const sessionId = crypto.randomBytes(16).toString('hex');
    
    db.prepare(`
      INSERT OR REPLACE INTO sessions (id, shop, state, accessToken, scope, isOnline)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, shop, state, access_token, scope, 0);

    // Guarda la sesión en la cookie del navegador
    req.session.shop = shop;
    req.session.accessToken = access_token;
    req.session.sessionId = sessionId;

    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).send('Session error');
      }

      registerWebhooks(shop, access_token).catch(console.error);
      
      // Redirección final para aplicaciones incrustadas.
      // Apunta a la URL donde Shopify espera que se cargue el iframe.
      res.redirect(`https://${shop}/admin/apps/${SHOPIFY_API_KEY}`);
    });

  } catch (error) {
    console.error('OAuth error:', error.response?.data || error.message);
    res.status(500).send('Authentication failed. Please try again.');
  }
});

// Función para registrar webhooks
async function registerWebhooks(shop, accessToken) {
  const webhooks = [
    { topic: 'orders/create', address: `https://${HOST}/webhooks/orders/create` },
    { topic: 'customers/create', address: `https://${HOST}/webhooks/customers/create` }
  ];

  for (const webhook of webhooks) {
    try {
      await axios.post(`https://${shop}/admin/api/2024-01/webhooks.json`, { webhook }, {
        headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' }
      });
      console.log('Registered webhook:', webhook.topic);
    } catch (error) {
      if (error.response?.status !== 422) {
        console.error('Webhook error:', error.response?.data || error.message);
      }
    }
  }
}

// Otras rutas
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

function verifyAuth(req, res, next) {
  const shop = req.session.shop || req.query.shop;
  if (!shop || !req.session.accessToken) {
    if (shop) return res.redirect(`/auth/shopify?shop=${shop}`);
    return res.status(401).json({ error: 'Not authenticated' });
  }
  req.shop = shop;
  next();
}

module.exports = router;
module.exports.verifyAuth = verifyAuth;
