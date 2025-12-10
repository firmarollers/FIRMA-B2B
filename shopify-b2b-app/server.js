require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

// Configuración básica
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

// RUTA PRINCIPAL - Dashboard B2B
app.get('/', (req, res) => {
  const { shop } = req.query;
  if (!shop) {
    return res.send(`
      <h1>B2B Wholesale App</h1>
      <p>Accede desde Shopify Admin o usa:</p>
      <code>https://firma-b2b.onrender.com?shop=tutienda.myshopify.com</code>
    `);
  }
  
  // Datos de ejemplo
  const data = {
    shop: shop,
    stats: {
      totalB2B: 12,
      pendingApprovals: 3,
      customerGroups: 2,
      b2bOrders: 47
    },
    customers: [
      { id: 1, name: "Empresa A", email: "a@empresa.com", status: "approved" },
      { id: 2, name: "Empresa B", email: "b@empresa.com", status: "pending" }
    ]
  };
  
  res.render('dashboard', data);
});

// Formulario público B2B
app.get('/b2b-signup', (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).send('Falta parámetro shop');
  res.render('signup', { shop });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    app: 'B2B Wholesale',
    time: new Date().toISOString()
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ B2B App running on port ${PORT}`);
  console.log(`📊 Dashboard: https://firma-b2b.onrender.com?shop=tutienda.myshopify.com`);
});
