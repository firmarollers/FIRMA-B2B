// server/routes/auth.js
const express = require('express');
const router = express.Router();
const Shopify = require('@shopify/shopify-api').shopifyApi;
const sessionStorage = require('../db/sessionStorage');

// Configurar Shopify API
const shopify = Shopify({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: process.env.SCOPES.split(','),
  hostName: process.env.HOST.replace(/https?:\/\//, ''),
  hostScheme: 'https',
  isEmbeddedApp: true,
  apiVersion: '2025-10',
  sessionStorage: {
    storeSession: sessionStorage.storeSession,
    loadSession: sessionStorage.loadSession,
    deleteSession: sessionStorage.deleteSession,
  },
});

// Middleware para verificar sesión
const verifySession = async (req, res, next) => {
  try {
    const session = await shopify.session.customAppSession(
      req.query.shop || req.body.shop,
      process.env.SHOPIFY_API_KEY
    );
    
    const storedSession = await sessionStorage.findSessionByShop(session.shop);
    
    if (storedSession && storedSession.access_token) {
      req.session = {
        ...session,
        accessToken: storedSession.access_token,
      };
      next();
    } else {
      console.log(`Authentication required - shop: ${session.shop} token: false`);
      res.redirect(`/auth?shop=${session.shop}`);
    }
  } catch (error) {
    console.error('Session verification error:', error);
    res.status(500).send('Error verifying session');
  }
};

// Ruta principal de autenticación
router.get('/auth', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).send('Missing shop parameter');
  }

  console.log(`Redirecting to Shopify OAuth for: ${shop}`);
  
  const authRoute = await shopify.auth.begin({
    shop,
    callbackPath: '/auth/callback',
    isOnline: false,
    rawRequest: req,
    rawResponse: res,
  });

  res.redirect(authRoute);
});

// Callback de OAuth
router.get('/auth/callback', async (req, res) => {
  try {
    const shop = req.query.shop;
    console.log(`OAuth callback for shop: ${shop}`);

    const session = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    console.log('Access token received');
    
    // Redirigir al admin de Shopify con los parámetros correctos
    const host = req.query.host;
    const redirectUrl = shopify.auth.buildEmbeddedAppUrl({
      rawRequest: req,
      rawResponse: res,
    });

    console.log(`Redirecting to admin: ${redirectUrl}`);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('Authentication failed');
  }
});

// Ruta principal de la app (requiere sesión)
router.get('/', verifySession, async (req, res) => {
  try {
    const session = req.session;
    
    // Crear cliente de Shopify con el token de acceso
    const client = new shopify.clients.Rest({
      session: {
        shop: session.shop,
        accessToken: session.accessToken,
      },
    });

    // Obtener clientes de Shopify
    const customers = await client.get({
      path: 'customers',
    });

    // Renderizar la vista principal
    res.render('index', {
      apiKey: process.env.SHOPIFY_API_KEY,
      shop: session.shop,
      host: req.query.host,
      customers: customers.body.customers || [],
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).send('Error loading dashboard');
  }
});

module.exports = { router, verifySession };
