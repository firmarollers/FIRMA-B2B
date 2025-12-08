const express = require('express');
const axios = require('axios');
const { queries, getDatabase } = require('../database/db');
const { verifyAuth } = require('./auth');

const router = express.Router();

// Apply auth middleware
router.use(verifyAuth);

// Get all B2B orders
router.get('/', (req, res) => {
  try {
    const orders = queries.getOrders();
    res.json(orders);
  } catch (error) {
    console.error('Error getting orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get pending approval orders
router.get('/pending', (req, res) => {
  try {
    const orders = queries.getPendingOrders();
    res.json(orders);
  } catch (error) {
    console.error('Error getting pending orders:', error);
    res.status(500).json({ error: 'Failed to fetch pending orders' });
  }
});

// Get order by ID
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const order = db.prepare(`
      SELECT o.*, c.email, c.company_name 
      FROM b2b_orders o 
      LEFT JOIN b2b_customers c ON o.customer_id = c.id 
      WHERE o.id = ?
    `).get(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    console.error('Error getting order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Approve order
router.post('/:id/approve', async (req, res) => {
  try {
    const orderId = req.params.id;
    const db = getDatabase();
    
    const order = db.prepare('SELECT * FROM b2b_orders WHERE id = ?').get(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Approve in database
    queries.approveOrder(orderId, req.session.shop);

    // Update order in Shopify if needed
    const shop = req.session.shop;
    const accessToken = req.session.accessToken;

    try {
      if (order.shopify_order_id) {
        // Add note to Shopify order
        await axios.post(
          `https://${shop}/admin/api/2024-01/orders/${order.shopify_order_id}/notes.json`,
          {
            note: {
              body: `B2B Order Approved by ${shop} at ${new Date().toISOString()}`,
              author: 'B2B Manager'
            }
          },
          {
            headers: { 
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json'
            }
          }
        );
      }

      // TODO: Send approval email to customer
      // TODO: Trigger fulfillment process

      res.json({ 
        success: true, 
        message: 'Order approved successfully'
      });

    } catch (shopifyError) {
      console.error('Shopify API error:', shopifyError.response?.data || shopifyError.message);
      res.json({ 
        success: true, 
        warning: 'Order approved but Shopify update failed',
        message: 'Order approved successfully'
      });
    }

  } catch (error) {
    console.error('Error approving order:', error);
    res.status(500).json({ error: 'Failed to approve order' });
  }
});

// Reject order
router.post('/:id/reject', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { reason } = req.body;
    const db = getDatabase();

    const order = db.prepare('SELECT * FROM b2b_orders WHERE id = ?').get(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Update in database
    db.prepare(`
      UPDATE b2b_orders 
      SET approval_status = 'rejected', 
          rejection_reason = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reason || 'Order rejected', orderId);

    // Cancel order in Shopify if exists
    const shop = req.session.shop;
    const accessToken = req.session.accessToken;

    try {
      if (order.shopify_order_id) {
        await axios.post(
          `https://${shop}/admin/api/2024-01/orders/${order.shopify_order_id}/cancel.json`,
          {
            reason: 'other',
            email: true,
            refund: true
          },
          {
            headers: { 
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json'
            }
          }
        );
      }

      // TODO: Send rejection email to customer

      res.json({ 
        success: true, 
        message: 'Order rejected successfully'
      });

    } catch (shopifyError) {
      console.error('Shopify API error:', shopifyError.response?.data || shopifyError.message);
      res.json({ 
        success: true, 
        warning: 'Order rejected but Shopify update failed',
        message: 'Order rejected in system'
      });
    }

  } catch (error) {
    console.error('Error rejecting order:', error);
    res.status(500).json({ error: 'Failed to reject order' });
  }
});

// Check if order meets minimum requirements
router.post('/validate', (req, res) => {
  try {
    const { customer_email, total_amount, items } = req.body;

    if (!customer_email) {
      return res.json({ valid: true, b2b_customer: false });
    }

    const customer = queries.getCustomerByEmail(customer_email);
    
    if (!customer || customer.status !== 'approved') {
      return res.json({ valid: true, b2b_customer: false });
    }

    const errors = [];
    const warnings = [];

    // Check minimum order value
    if (customer.minimum_order_value && parseFloat(total_amount) < customer.minimum_order_value) {
      errors.push(`Minimum order value is $${customer.minimum_order_value}`);
    }

    // Check maximum order value
    if (customer.maximum_order_value && parseFloat(total_amount) > customer.maximum_order_value) {
      errors.push(`Maximum order value is $${customer.maximum_order_value}`);
    }

    // Get minimum order value from settings
    const globalMin = parseFloat(queries.getSetting('min_order_value')) || 0;
    if (globalMin > 0 && parseFloat(total_amount) < globalMin) {
      errors.push(`Minimum order value is $${globalMin}`);
    }

    // TODO: Check minimum quantities per product if configured

    const valid = errors.length === 0;

    res.json({
      valid,
      b2b_customer: true,
      errors,
      warnings,
      requires_approval: queries.getSetting('approval_required') === 'true',
      customer: {
        id: customer.id,
        company_name: customer.company_name,
        group: customer.group_id
      }
    });

  } catch (error) {
    console.error('Error validating order:', error);
    res.status(500).json({ error: 'Failed to validate order' });
  }
});

module.exports = router;