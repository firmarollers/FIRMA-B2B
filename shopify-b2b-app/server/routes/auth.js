// server/routes/auth.js

const express = require('express');
const crypto = require('crypto');
const axios = require('axios'); 
// No se necesita getDatabase() temporalmente
// const { getDatabase } = require('../database/db'); 

const router = express.Router();

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SCOPES = process.env.SCOPES || 'read_products,write_products,read_customers,write_customers,read_orders,write_orders,read_price_rules,write_price_rules,read_discounts,write_discounts';
const HOST = process.env.HOST || 'firma-b2b.onrender.com';

// Middleware para verificar autenticación (definido aquí, exportado al final)
function verifyAuth(req, res, next) {
    var shop = req.session.shop || req.query.shop;
    var accessToken = req.session.accessToken;
    
    if (!shop || !accessToken) {
        console.log('Authentication required - shop:', shop, 'token:', !!accessToken);
        
        if (req.url.startsWith('/api')) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        if (shop) {
            return res.redirect('/auth/shopify?shop=' + shop);
        }
        
        return res.redirect('/');
    }
    
    req.shop = shop;
    req.accessToken = accessToken;
    
    next();
}


// 1. Iniciar la autenticación (OAuth)
router.get('/shopify', function(req, res) {
  var shop = req.query.shop;
  if (!shop) {
    return res.status(400).send('Missing shop parameter. Please add ?shop=your-shop.myshopify.com');
  }

  var state = crypto.randomBytes(16).toString('hex');
  var redirectUri = 'https://' + HOST + '/auth/callback';
  var installUrl = 'https://' + shop + '/admin/oauth/authorize?client_id=' + SHOPIFY_API_KEY + '&scope=' + SCOPES + '&state=' + state + '&redirect_uri=' + redirectUri;

  req.session.state = state;
  req.session.shop = shop;
  
  // Guardar la sesión antes de redirigir
  req.session.save(function(err) {
    if (err) {
      console.error('Session save error:', err);
      return res.status(500).send('Session error');
    }
    console.log('Redirecting to Shopify OAuth for:', shop);
    res.redirect(installUrl);
  });
});

// 2. Manejar el Callback de Shopify
router.get('/callback', async function(req, res) {
  var shop = req.query.shop;
  var code = req.query.code;
  var state = req.query.state;
  var host = req.query.host; // CRÍTICO: CAPTURAMOS EL HOST

  console.log('OAuth callback for shop:', shop);

  if (state !== req.session.state) {
    console.error('State mismatch');
    return res.status(403).send('Request origin cannot be verified');
  }

  // CRÍTICO: Verificar que tenemos el HOST para App Bridge
  if (!shop || !code || !host) { 
    console.error('Missing required parameters (shop, code, or host)');
    return res.status(400).send('Required parameters missing');
  }
  
  // Limpiamos el estado temporal CSRF
  delete req.session.state;

  try {
    console.log('Exchanging code for access token...');
    
    // 1. Intercambio de Código por Token de Acceso
    var response = await axios.post('https://' + shop + '/admin/oauth/access_token', {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code: code
    });

    var accessToken = response.data.access_token;
    var scope = response.data.scope;
    
    console.log('Access token received');

    // --- GESTIÓN DE LA BASE DE DATOS (COMENTADA PARA DIAGNÓSTICO DEL 502) ---
    var sessionId = crypto.randomBytes(16).toString('hex');
    /*
    try {
      const { getDatabase } = require('../database/db'); 
      var db = getDatabase();
      // Esta línea es la principal sospechosa del crash síncrono.
      db.prepare('INSERT OR REPLACE INTO sessions (id, shop, state, accessToken, scope, isOnline) VALUES (?, ?, ?, ?, ?, ?)').run(sessionId, shop, state, accessToken, scope, 0);
    } catch (dbError) {
      console.warn('WARNING: Failed to save shop/session to SQLite. Continuing with Express Session.', dbError);
    }
    */
    // -------------------------------------------------------------------------

    // 3. Actualizar la Sesión de Express (CRÍTICO para la autenticación)
    req.session.shop = shop;
    req.session.accessToken = accessToken;
    req.session.sessionId = sessionId;

    req.session.save(function(err) {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).send('Session error');
      }

      console.log('Session saved, registering webhooks...');
      // Se mantiene el registro de webhooks ya que no bloquea la redirección.
      registerWebhooks(shop, accessToken).catch(console.error);
      
      console.log('Redirecting to admin dashboard with host parameter');
      // CRÍTICO: Incluir el parámetro 'host' para App Bridge
      res.redirect('/admin?shop=' + shop + '&host=' + host);
    });

  } catch (error) {
    console.error('OAuth error (Axios):', error.response ? error.response.data : error.message);
    res.status(500).send('Authentication failed. Please try again.');
  }
});

async function registerWebhooks(shop, accessToken) {
  var webhooks = [
    { topic: 'orders/create', address: 'https://' + HOST + '/webhooks/orders/create' },
    { topic: 'customers/create', address: 'https://' + HOST + '/webhooks/customers/create' },
    { topic: 'customers/update', address: 'https://' + HOST + '/webhooks/customers/update' }
  ];

  for (var i = 0; i < webhooks.length; i++) {
    var webhook = webhooks[i];
    var shopifyApiVersion = '2024-01'; 
    try {
      await axios.post('https://' + shop + '/admin/api/' + shopifyApiVersion + '/webhooks.json', { webhook: webhook }, {
        headers: { 
          'X-Shopify-Access-Token': accessToken, 
          'Content-Type': 'application/json' 
        }
      });
      console.log('Registered webhook:', webhook.topic);
    } catch (error) {
      if (error.response && error.response.status !== 422) {
        console.error('Webhook registration error:', webhook.topic, error.response ? error.response.data : error.message);
      }
    }
  }
}

router.get('/logout', function(req, res) {
  req.session.destroy(function(err) {
    if (err) console.error('Logout error:', err);
    res.redirect('/');
  });
});


module.exports = router;
module.exports.verifyAuth = verifyAuth;
