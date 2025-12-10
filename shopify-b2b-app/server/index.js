// server/index.js
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const path = require('path');
const { router: authRoutes } = require('./routes/auth');
const customerRoutes = require('./routes/customers').router || require('./routes/customers');

const app = express();
const PORT = process.env.PORT || 10000;

// Configuración de seguridad para producción
if (process.env.NODE_ENV === 'production') {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.shopify.com", "https://cdn.jsdelivr.net"],
        scriptSrc: ["'self'", "https://cdn.shopify.com", "https://unpkg.com", "https://cdn.jsdelivr.net"],
        frameSrc: ["'self'", "https://cdn.shopify.com"],
        frameAncestors: ["'self'", "https://*.myshopify.com", "https://admin.shopify.com"],
        connectSrc: ["'self'", "https://*.myshopify.com", "https://cdn.shopify.com"],
        imgSrc: ["'self'", "data:", "https://cdn.shopify.com"],
        fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      },
    },
  }));
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configurar EJS como motor de plantillas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Importar rutas
app.use('/auth', authRoutes);
app.use('/api/customers', customerRoutes);

// Ruta para formulario público de registro B2B
app.get('/b2b-signup', (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).send('Shop parameter is required. Use /b2b-signup?shop=tustore.myshopify.com');
  }
  res.render('b2b-signup', { shop: shop });
});

// Ruta principal de la app
app.get('/', (req, res) => {
  const { shop, host } = req.query;
  
  // Si no hay parámetros de tienda, redirigir a autenticación
  if (!shop) {
    // Puedes redirigir a una tienda por defecto o mostrar error
    return res.status(400).send(`
      <h1>Shop parameter missing</h1>
      <p>Please access this app from your Shopify admin or use:</p>
      <code>https://firma-b2b.onrender.com?shop=tustore.myshopify.com</code>
      <p>Or install via: <code>https://firma-b2b.onrender.com/auth?shop=tustore.myshopify.com</code></p>
    `);
  }
  
  // Renderizar el dashboard principal
  res.render('index', { 
    shop: shop, 
    host: host || shop,
    apiKey: process.env.SHOPIFY_API_KEY 
  });
});

// Ruta de salud para verificar que el servidor funciona
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Manejo de errores 404
app.use((req, res) => {
  res.status(404).send(`
    <h1>404 - Page Not Found</h1>
    <p>Available routes:</p>
    <ul>
      <li><code>GET /</code> - Main app dashboard</li>
      <li><code>GET /auth</code> - OAuth authentication</li>
      <li><code>GET /b2b-signup?shop=...</code> - Public registration form</li>
      <li><code>GET /api/customers?shop=...</code> - API for customers</li>
      <li><code>POST /api/customers/approve</code> - Approve B2B customer</li>
      <li><code>POST /api/customers/b2b-signup</code> - Submit B2B application</li>
    </ul>
  `);
});

// Manejo de errores generales
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send(`
    <h1>500 - Server Error</h1>
    <p>${err.message}</p>
    <pre>${process.env.NODE_ENV === 'production' ? 'Contact support' : err.stack}</pre>
  `);
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`B2B App running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Shopify API Key configured: ${!!process.env.SHOPIFY_API_KEY}`);
  console.log(`Database path: ${path.join(__dirname, '..', 'data', 'b2b.db')}`);
});
