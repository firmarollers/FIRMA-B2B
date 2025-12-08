const express = require('express');
const { queries } = require('../database/db');
const { verifyAuth } = require('./auth');

const router = express.Router();

// Apply auth middleware
router.use(verifyAuth);

// Get all pricing rules
router.get('/', (req, res) => {
  try {
    const rules = queries.getPricingRules();
    res.json(rules);
  } catch (error) {
    console.error('Error getting pricing rules:', error);
    res.status(500).json({ error: 'Failed to fetch pricing rules' });
  }
});

// Create pricing rule
router.post('/', (req, res) => {
  try {
    const {
      name,
      type, // 'percentage', 'fixed_price', 'fixed_discount'
      value,
      applies_to, // 'all', 'products', 'collections'
      product_ids,
      collection_ids,
      customer_group_id,
      customer_id,
      min_quantity,
      max_quantity,
      start_date,
      end_date,
      priority,
      active
    } = req.body;

    if (!name || !type || value === undefined) {
      return res.status(400).json({ error: 'Name, type, and value are required' });
    }

    const result = queries.createPricingRule({
      name,
      type,
      value: parseFloat(value),
      applies_to: applies_to || 'all',
      customer_group_id,
      customer_id,
      min_quantity: parseInt(min_quantity) || 1,
      max_quantity: max_quantity ? parseInt(max_quantity) : null,
      priority: parseInt(priority) || 0,
      active: active !== undefined ? (active ? 1 : 0) : 1
    });

    res.json({ 
      success: true, 
      id: result.lastInsertRowid,
      message: 'Pricing rule created successfully' 
    });
  } catch (error) {
    console.error('Error creating pricing rule:', error);
    res.status(500).json({ error: 'Failed to create pricing rule' });
  }
});

// Calculate price for customer and product
router.post('/calculate', (req, res) => {
  try {
    const { customer_email, product_id, variant_id, quantity, original_price } = req.body;

    if (!customer_email || !original_price) {
      return res.status(400).json({ error: 'Customer email and original price are required' });
    }

    // Get customer
    const customer = queries.getCustomerByEmail(customer_email);
    if (!customer || customer.status !== 'approved') {
      return res.json({ 
        b2b_customer: false,
        original_price: parseFloat(original_price),
        final_price: parseFloat(original_price),
        discount: 0
      });
    }

    // Get applicable pricing rules
    const rules = queries.getPricingRules();
    let bestDiscount = customer.discount_percentage || 0;
    let appliedRule = 'Customer group discount';

    // Filter rules applicable to this customer/group
    for (const rule of rules) {
      if (!rule.active) continue;

      // Check if rule applies to this customer or their group
      const appliesToCustomer = rule.customer_id && rule.customer_id === customer.id;
      const appliesToGroup = rule.customer_group_id && rule.customer_group_id === customer.group_id;
      
      if (!appliesToCustomer && !appliesToGroup && rule.customer_id && rule.customer_group_id) {
        continue;
      }

      // Check quantity requirements
      const qty = parseInt(quantity) || 1;
      if (rule.min_quantity && qty < rule.min_quantity) continue;
      if (rule.max_quantity && qty > rule.max_quantity) continue;

      // Check date validity
      if (rule.start_date && new Date(rule.start_date) > new Date()) continue;
      if (rule.end_date && new Date(rule.end_date) < new Date()) continue;

      // Calculate discount based on rule type
      let discount = 0;
      if (rule.type === 'percentage') {
        discount = rule.value;
      } else if (rule.type === 'fixed_discount') {
        discount = (rule.value / parseFloat(original_price)) * 100;
      }

      // Use best discount (highest priority or largest discount)
      if (discount > bestDiscount || (discount === bestDiscount && rule.priority > 0)) {
        bestDiscount = discount;
        appliedRule = rule.name;
      }
    }

    const finalPrice = parseFloat(original_price) * (1 - bestDiscount / 100);

    res.json({
      b2b_customer: true,
      original_price: parseFloat(original_price),
      final_price: parseFloat(finalPrice.toFixed(2)),
      discount: bestDiscount,
      discount_amount: parseFloat((original_price - finalPrice).toFixed(2)),
      applied_rule: appliedRule,
      customer: {
        id: customer.id,
        company_name: customer.company_name,
        group: customer.group_id
      }
    });

  } catch (error) {
    console.error('Error calculating price:', error);
    res.status(500).json({ error: 'Failed to calculate price' });
  }
});

// Delete pricing rule
router.delete('/:id', (req, res) => {
  try {
    const db = require('../database/db').getDatabase();
    const stmt = db.prepare('DELETE FROM pricing_rules WHERE id = ?');
    stmt.run(req.params.id);

    res.json({ success: true, message: 'Pricing rule deleted successfully' });
  } catch (error) {
    console.error('Error deleting pricing rule:', error);
    res.status(500).json({ error: 'Failed to delete pricing rule' });
  }
});

// Toggle pricing rule active status
router.patch('/:id/toggle', (req, res) => {
  try {
    const db = require('../database/db').getDatabase();
    const rule = db.prepare('SELECT * FROM pricing_rules WHERE id = ?').get(req.params.id);
    
    if (!rule) {
      return res.status(404).json({ error: 'Pricing rule not found' });
    }

    const newStatus = rule.active === 1 ? 0 : 1;
    db.prepare('UPDATE pricing_rules SET active = ? WHERE id = ?').run(newStatus, req.params.id);

    res.json({ success: true, active: newStatus === 1 });
  } catch (error) {
    console.error('Error toggling pricing rule:', error);
    res.status(500).json({ error: 'Failed to toggle pricing rule' });
  }
});

module.exports = router;