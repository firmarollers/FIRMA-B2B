const express = require('express');
const axios = require('axios');
const { queries } = require('../database/db');
const { verifyAuth } = require('./auth');

const router = express.Router();

// Apply auth middleware to protected routes
router.use(verifyAuth);

// Get all B2B customers
router.get('/', (req, res) => {
  try {
    const customers = queries.getCustomers();
    
    // Format response
    const formattedCustomers = customers.map(c => ({
      id: c.id,
      name: c.company_name || 'N/A',
      email: c.email,
      group: c.group_name || 'None',
      status: c.status,
      created_at: c.created_at,
      discount_percentage: c.discount_percentage,
      minimum_order_value: c.minimum_order_value
    }));

    res.json(formattedCustomers);
  } catch (error) {
    console.error('Error getting customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Get customer by ID
router.get('/:id', (req, res) => {
  try {
    const customer = queries.getCustomerById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(customer);
  } catch (error) {
    console.error('Error getting customer:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// Create B2B customer (from registration form)
router.post('/', async (req, res) => {
  try {
    const { email, company_name, tax_id, phone, website, message } = req.body;

    if (!email || !company_name) {
      return res.status(400).json({ error: 'Email and company name are required' });
    }

    // Check if customer already exists
    const existing = queries.getCustomerByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'Customer already registered' });
    }

    // Create B2B customer in database
    const result = queries.createCustomer({
      email,
      company_name,
      tax_id,
      phone,
      website,
      status: 'pending',
      notes: message || ''
    });

    // Send notification email (implement email service)
    // TODO: Send email to admin about new B2B registration

    res.json({ 
      success: true, 
      id: result.lastInsertRowid,
      message: 'Application submitted successfully. You will be notified once approved.' 
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Failed to create customer application' });
  }
});

// Approve B2B customer
router.post('/:id/approve', async (req, res) => {
  try {
    const customerId = req.params.id;
    const customer = queries.getCustomerById(customerId);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Approve in database
    queries.approveCustomer(customerId, req.session.shop);

    // Create or update customer in Shopify with B2B tag
    const shop = req.session.shop;
    const accessToken = req.session.accessToken;

    try {
      // Search for existing customer
      const searchResponse = await axios.get(
        `https://${shop}/admin/api/2024-01/customers/search.json?query=email:${customer.email}`,
        {
          headers: { 'X-Shopify-Access-Token': accessToken }
        }
      );

      let shopifyCustomerId;

      if (searchResponse.data.customers && searchResponse.data.customers.length > 0) {
        // Customer exists, update tags
        shopifyCustomerId = searchResponse.data.customers[0].id;
        const existingTags = searchResponse.data.customers[0].tags || '';
        const newTags = existingTags ? `${existingTags}, b2b, wholesale` : 'b2b, wholesale';

        await axios.put(
          `https://${shop}/admin/api/2024-01/customers/${shopifyCustomerId}.json`,
          {
            customer: {
              id: shopifyCustomerId,
              tags: newTags
            }
          },
          {
            headers: { 
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json'
            }
          }
        );
      } else {
        // Create new customer
        const createResponse = await axios.post(
          `https://${shop}/admin/api/2024-01/customers.json`,
          {
            customer: {
              email: customer.email,
              first_name: customer.company_name,
              tags: 'b2b, wholesale',
              note: `B2B Customer - ${customer.company_name}`,
              tax_exempt: false
            }
          },
          {
            headers: { 
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json'
            }
          }
        );
        shopifyCustomerId = createResponse.data.customer.id;
      }

      // Update database with Shopify customer ID
      queries.updateCustomer(customerId, {
        shopify_customer_id: String(shopifyCustomerId)
      });

      // TODO: Send approval email to customer

      res.json({ success: true, message: 'Customer approved successfully' });

    } catch (shopifyError) {
      console.error('Shopify API error:', shopifyError.response?.data || shopifyError.message);
      // Still mark as approved in our database even if Shopify sync fails
      res.json({ 
        success: true, 
        warning: 'Customer approved but Shopify sync failed. Please tag customer manually.',
        message: 'Customer approved successfully'
      });
    }

  } catch (error) {
    console.error('Error approving customer:', error);
    res.status(500).json({ error: 'Failed to approve customer' });
  }
});

// Reject B2B customer
router.post('/:id/reject', (req, res) => {
  try {
    const customerId = req.params.id;
    const { reason } = req.body;

    const customer = queries.getCustomerById(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    queries.updateCustomer(customerId, {
      status: 'rejected',
      notes: reason || 'Application rejected'
    });

    // TODO: Send rejection email to customer

    res.json({ success: true, message: 'Customer rejected' });
  } catch (error) {
    console.error('Error rejecting customer:', error);
    res.status(500).json({ error: 'Failed to reject customer' });
  }
});

// Update customer
router.put('/:id', (req, res) => {
  try {
    const customerId = req.params.id;
    const updates = req.body;

    const customer = queries.getCustomerById(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    queries.updateCustomer(customerId, updates);

    res.json({ success: true, message: 'Customer updated successfully' });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// Assign customer to group
router.post('/:id/assign-group', (req, res) => {
  try {
    const customerId = req.params.id;
    const { group_id } = req.body;

    const customer = queries.getCustomerById(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const group = queries.getGroupById(group_id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    queries.updateCustomer(customerId, {
      group_id,
      discount_percentage: group.discount_percentage,
      minimum_order_value: group.minimum_order_value,
      maximum_order_value: group.maximum_order_value,
      payment_terms: group.payment_terms
    });

    res.json({ success: true, message: 'Customer assigned to group successfully' });
  } catch (error) {
    console.error('Error assigning customer to group:', error);
    res.status(500).json({ error: 'Failed to assign customer to group' });
  }
});

module.exports = router;