// server/index.js
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const path = require('path');
const { router: authRoutes, verifySession } = require('./routes/auth');
const customerController = require('./controllers/customerController');

const app = express();
const PORT = process.env.PORT || 10000;

// Configuración de seguridad para producción
if (process.env.NODE_ENV === 'production') {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.shopify.com"],
        scriptSrc: ["'self'", "https://cdn.shopify.com"],
        frameSrc: ["'self'", "https://cdn.shopify.com"],
        frameAncestors: ["'self'", "https://*.myshopify.com", "https://admin.shopify.com"],
        connectSrc: ["'self'", "https://*.myshopify.com", "https://cdn.shopify.com"],
        imgSrc: ["'self'", "data:", "https://cdn.shopify.com"],
      },
    },
  }));
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Rutas de autenticación
app.use('/auth', authRoutes);

// Ruta principal de la app (protegida)
app.get('/', authRoutes);

// API para clientes (protegida)
app.get('/api/customers', verifySession, customerController.getAllCustomers);
app.post('/api/customers/approve', verifySession, customerController.approveCustomer);
app.post('/api/b2b-signup', customerController.b2bSignup);

// Ruta para formulario público de registro B2B
app.get('/b2b-signup', (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).send('Shop parameter is required');
  }
  res.render('b2b-signup', { shop: shop });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`B2B App running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Shopify API Key configured: ${!!process.env.SHOPIFY_API_KEY}`);
});
