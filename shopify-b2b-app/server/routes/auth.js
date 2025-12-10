// server/routes/auth.js - VERSIÓN CORREGIDA (RUTAS FIJAS)
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

// RUTA CORREGIDA: '/' en lugar de '/auth'
router.get('/', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).send('Missing shop parameter. Use: /auth?shop=your-store.myshopify.com');
  }

  console.log(`[AUTH] Starting OAuth for: ${shop}`);
  
  try {
    const authRoute = await shopify.auth.begin({
      shop,
      callbackPath: '/auth/callback',  // IMPORTANTE: Este es el path COMPLETO
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });

    console.log(`[AUTH] Redirecting to: ${authRoute}`);
    res.redirect(authRoute);
  } catch (error) {
    console.error('[AUTH] Error:', error);
    res.status(500).send(`Authentication error: ${error.message}`);
  }
});

// RUTA CORREGIDA: '/callback' en lugar de '/auth/callback'
router.get('/callback', async (req, res) => {
  try {
    const shop = req.query.shop;
    console.log(`[CALLBACK] OAuth callback for shop: ${shop}`);

    const session = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    console.log('[CALLBACK] Access token received');
    
    // Redirigir al admin de Shopify
    const redirectUrl = shopify.auth.buildEmbeddedAppUrl({
      rawRequest: req,
      rawResponse: res,
    });

    console.log(`[CALLBACK] Redirecting to: ${redirectUrl}`);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('[CALLBACK] Error:', error);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

// Ruta de prueba para verificar que el router funciona
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Auth router is working',
    routes: ['GET /', 'GET /callback', 'GET /test'],
    timestamp: new Date().toISOString()
  });
});

module.exports = { router, verifySession };
