const express = require('express');
const axios = require('axios'); // Asegúrate de que axios esté importado
const { queries } = require('../database/db');
const { verifyAuth } = require('./auth');

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyAuth);

// Get B2B Customers (Combina datos locales)
router.get('/customers', async (req, res) => {
    // req.shop y req.accessToken vienen de verifyAuth (disponibles, aunque no se usan para fetch de Shopify aquí)
    
    try {
        // Obtenemos los clientes B2B de nuestra base de datos local (que incluye status, grupo, etc.)
        const localCustomers = queries.getCustomers(); 

        // Mapeamos los datos al formato que espera el front-end:
        const customersData = localCustomers.map(c => ({
            id: c.id,
            // Usamos Company Name si existe, o parte del Email si no
            name: c.company_name || c.email.split('@')[0], 
            email: c.email,
            group_name: c.group_name || 'None',
            status: c.status,
            created_at: c.created_at
        }));

        res.json(customersData);

    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ error: 'Failed to fetch customer data' });
    }
});


// Get dashboard stats
router.get('/stats', (req, res) => {
  try {
    const stats = queries.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get all customer groups
router.get('/groups', (req, res) => {
  try {
    const groups = queries.getGroups();
    res.json(groups);
  } catch (error) {
    console.error('Error getting groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Create customer group
router.post('/groups', (req, res) => {
  try {
    const { name, description, discount_percentage, minimum_order_value, maximum_order_value, payment_terms } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const result = queries.createGroup({
      name,
      description,
      discount_percentage: parseFloat(discount_percentage) || 0,
      minimum_order_value: parseFloat(minimum_order_value) || 0,
      maximum_order_value: parseFloat(maximum_order_value) || 0,
      payment_terms: payment_terms || 'immediate'
    });

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Get app settings
router.get('/settings', (req, res) => {
  try {
    const settings = {
      approval_required: queries.getSetting('approval_required') === 'true',
      auto_approve_orders: queries.getSetting('auto_approve_orders') === 'true',
      min_order_value: parseFloat(queries.getSetting('min_order_value')) || 0,
      notification_email: queries.getSetting('notification_email') || '',
      terms_and_conditions: queries.getSetting('terms_and_conditions') || ''
    };
    res.json(settings);
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update app settings
router.post('/settings', (req, res) => {
  try {
    const settings = req.body;

    for (const [key, value] of Object.entries(settings)) {
      queries.setSetting(key, String(value));
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
