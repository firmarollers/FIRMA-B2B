const express = require('express');
const { queries } = require('../database/db');

const router = express.Router();

// Public endpoint - check if customer is B2B
router.get('/customer-status', (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.json({ is_b2b: false });
    }

    const customer = queries.getCustomerByEmail(email);

    if (!customer || customer.status !== 'approved') {
      return res.json({ is_b2b: false });
    }

    res.json({
      is_b2b: true,
      customer: {
        id: customer.id,
        company_name: customer.company_name,
        discount_percentage: customer.discount_percentage,
        minimum_order_value: customer.minimum_order_value,
        maximum_order_value: customer.maximum_order_value,
        group_id: customer.group_id
      }
    });

  } catch (error) {
    console.error('Error checking customer status:', error);
    res.status(500).json({ error: 'Failed to check customer status' });
  }
});

// Public endpoint - calculate B2B price
router.post('/calculate-price', (req, res) => {
  try {
    const { customer_email, product_id, variant_id, quantity, original_price } = req.body;

    if (!customer_email || !original_price) {
      return res.json({ 
        b2b_customer: false,
        original_price: parseFloat(original_price),
        final_price: parseFloat(original_price)
      });
    }

    const customer = queries.getCustomerByEmail(customer_email);

    if (!customer || customer.status !== 'approved') {
      return res.json({ 
        b2b_customer: false,
        original_price: parseFloat(original_price),
        final_price: parseFloat(original_price)
      });
    }

    // Simple discount calculation (can be extended with pricing rules)
    const discount = customer.discount_percentage || 0;
    const finalPrice = parseFloat(original_price) * (1 - discount / 100);

    res.json({
      b2b_customer: true,
      original_price: parseFloat(original_price),
      final_price: parseFloat(finalPrice.toFixed(2)),
      discount: discount,
      discount_amount: parseFloat((original_price - finalPrice).toFixed(2)),
      minimum_order_value: customer.minimum_order_value
    });

  } catch (error) {
    console.error('Error calculating price:', error);
    res.status(500).json({ error: 'Failed to calculate price' });
  }
});

// Public endpoint - validate cart
router.post('/validate-cart', (req, res) => {
  try {
    const { customer_email, total_amount } = req.body;

    if (!customer_email) {
      return res.json({ valid: true, is_b2b: false });
    }

    const customer = queries.getCustomerByEmail(customer_email);

    if (!customer || customer.status !== 'approved') {
      return res.json({ valid: true, is_b2b: false });
    }

    const errors = [];

    // Check minimum order value
    if (customer.minimum_order_value && parseFloat(total_amount) < customer.minimum_order_value) {
      errors.push(`Minimum order value is $${customer.minimum_order_value.toFixed(2)}`);
    }

    // Check maximum order value
    if (customer.maximum_order_value && parseFloat(total_amount) > customer.maximum_order_value) {
      errors.push(`Maximum order value is $${customer.maximum_order_value.toFixed(2)}`);
    }

    res.json({
      valid: errors.length === 0,
      is_b2b: true,
      errors,
      minimum_order_value: customer.minimum_order_value,
      maximum_order_value: customer.maximum_order_value
    });

  } catch (error) {
    console.error('Error validating cart:', error);
    res.status(500).json({ error: 'Failed to validate cart' });
  }
});

module.exports = router;