// server/routes/auth.js - VERSIÓN CON ADAPTER CORRECTO
const express = require('express');
const router = express.Router();

// IMPORTAR CON ADAPTER PARA NODE.JS
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');

const sessionStorage = require('../db/sessionStorage');

// Configurar Shopify API CON ADAPTER
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: process.env.SCOPES.split(','),
  hostName: process.env.HOST.replace(/https?:\/\//, ''),
  hostScheme: 'https',
  isEmbeddedApp: true,
  apiVersion: LATEST_API_VERSION, // Usar versión automática
  sessionStorage: {
    storeSession: sessionStorage.storeSession,
    loadSession: sessionStorage.loadSession,
    deleteSession: sessionStorage.deleteSession,
  },
});

// Ruta principal de autenticación
router.get('/', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).send('Missing shop parameter');
  }

  console.log(`[AUTH] Starting OAuth for: ${shop}`);
  
  try {
    const authRoute = await shopify.auth.begin({
      shop,
      callbackPath: '/auth/callback',
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });

    console.log(`[AUTH] Redirecting to Shopify...`);
    res.redirect(authRoute);
  } catch (error) {
    console.error('[AUTH] Error:', error.message);
    res.status(500).send(`Authentication error: ${error.message}`);
  }
});

// Callback de OAuth
router.get('/callback', async (req, res) => {
  try {
    const shop = req.query.shop;
    console.log(`[CALLBACK] Processing for shop: ${shop}`);

    const callback = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    console.log('[CALLBACK] Access token received');
    
    // Redirigir al admin
    const redirectUrl = shopify.auth.buildEmbeddedAppUrl({
      rawRequest: req,
      rawResponse: res,
    });

    console.log(`[CALLBACK] Redirecting to admin...`);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('[CALLBACK] Error:', error.message);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

// Ruta de prueba
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Auth router working',
    timestamp: new Date().toISOString()
  });
});

module.exports = { router };
