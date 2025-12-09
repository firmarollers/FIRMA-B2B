const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const { getDatabase } = require('../database/db'); 

const router = express.Router();

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SCOPES = process.env.SCOPES || 'read_products,write_products,read_customers,write_customers,read_orders,write_orders,read_price_rules,write_price_rules,read_discounts,write_discounts';
const HOST = process.env.HOST || 'firma-b2b.onrender.com'; 

// 1. Ruta de inicio de la autenticación (Inicia el flujo OAuth)
router.get('/shopify', (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).send('Missing shop parameter. Please add ?shop=your-shop.myshopify.com');
  }

  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = `https://${HOST}/auth/callback`; 
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SCOPES}&state=${state}&redirect_uri=${redirectUri}`;

  req.session.state = state;
  req.session.shop = shop;
  
  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
      return res.status(500).send('Session error');
    }
    console.log('✅ Redirecting to Shopify OAuth for:', shop);
    res.redirect(installUrl);
  });
});

// 2. Ruta de callback (Recibe el código y lo intercambia por el Access Token)
router.get('/callback', async (req, res) => {
  const { shop, code, state } = req.query;
  
  console.log('✅ OAuth callback for shop:', shop);

  if (state !== req.session.state) {
    console.error('❌ State mismatch - possible CSRF attack');
    return res.status(403).send('Request origin cannot be verified'); 
  }

  if (!shop || !code) {
    console.error('❌ Missing shop or code parameter');
    return res.status(400).send('Required parameters missing');
  }

  try {
    console.log('🔄 Exchanging code for access token...');
    
    const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code
    });

    const { access_token, scope } = response.data;
    
    console.log('✅ Access token received successfully');

    const db = getDatabase();
    const sessionId = crypto.randomBytes(16).toString('hex');
    
    db.prepare(`
      INSERT OR REPLACE INTO sessions (id, shop, state, accessToken, scope, isOnline)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, shop, state, access_token, scope, 0);

    req.session.shop = shop;
    req.session.accessToken = access_token;
    req.session.sessionId = sessionId;

    req.session.save((err) => {
      if (err) {
        console.error('❌ Session save error:', err);
        return res.status(500).send('Session error');
      }

      console.log('✅ Session saved, registering webhooks...');
      registerWebhooks(shop, access_token).catch(console.error);
      
      console.log('✅ Redirecting to admin dashboard');
      // CORRECCIÓN: Redirige a nuestro dashboard, no al de Shopify
      res.redirect(`/admin?shop=${shop}`);
    });

  } catch (error) {
    console.error('❌ OAuth error:', error.response?.data || error.message);
    res.status(500).send('Authentication failed. Please try again.');
  }
});

// Función para registrar webhooks
async function registerWebhooks(shop, accessToken) {
  const webhooks = [
    { topic: 'orders/create', address: `https://${HOST}/webhooks/orders/create` },
    { topic: 'customers/create', address: `https://${HOST}/webhooks/customers/create` },
    { topic: 'customers/update', address: `https://${HOST}/webhooks/customers/update` }
  ];

  for (const webhook of webhooks) {
    try {
      await axios.post(`https://${shop}/admin/api/2024-01/webhooks.json`, { webhook }, {
        headers: { 
          'X-Shopify-Access-Token': accessToken, 
          'Content-Type': 'application/json' 
        }
      });
      console.log('✅ Registered webhook:', webhook.topic);
    } catch (error) {
      if (error.response?.status !== 422) {
        console.error('❌ Webhook registration error:', webhook.topic, error.response?.data || error.message);
      }
    }
  }
}

// Ruta de logout
router.get('/logout', (req, res) => {
  const shop = req.session.shop;
  req.session.destroy((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/');
  });
});

// Middleware de autenticación
function verifyAuth(req, res, next) {
  const shop = req.session.shop || req.query.shop;
  const accessToken = req.session.accessToken;
  
  if (!shop || !accessToken) {
    console.log('⚠️ Authentication required - shop:', shop, 'token:', !!accessToken);
    
    // Para API requests, retorna 401
    if (req.url.startsWith('/api')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Para rutas web, redirige al flujo de instalación
    if (shop) {
      return res.redirect(`/auth/shopify?shop=${shop}`);
    }
    
    return res.redirect('/');
  }
  
  // Adjunta shop y token a la solicitud
  req.shop = shop;
  req.accessToken = accessToken;
  
  next();
}

module.exports = router;
module.exports.verifyAuth = verifyAuth;
```

---

## 📋 Resumen de cambios clave:

1. ✅ **Línea 72:** `res.redirect(\`/admin?shop=\${shop}\`)` - Redirige a TU dashboard
2. ✅ **Logs mejorados:** Añadí emojis (✅❌🔄⚠️) para debug más fácil
3. ✅ **verifyAuth mejorado:** Maneja mejor las redirecciones
4. ✅ **3 webhooks:** orders, customers/create, customers/update

---

## 🚀 Ahora haz esto:

1. **GitHub** → `server/routes/auth.js` → **Reemplaza TODO** con el código de arriba
2. **Commit** → "Fix OAuth redirect and improve auth"
3. **Espera deploy** en Render (2-3 min)
4. **Cuando veas** `Your service is live 🎉` en los logs
5. **Abre esta URL:**
```
https://firma-b2b.onrender.com/auth/shopify?shop=qy5r19-gm.myshopify.com
