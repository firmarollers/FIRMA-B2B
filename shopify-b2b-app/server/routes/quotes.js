const express = require('express');
const { queries, getDatabase } = require('../database/db');
const { verifyAuth } = require('./auth');

const router = express.Router();

// Get all quote requests (admin - requires auth)
router.get('/', verifyAuth, (req, res) => {
  try {
    const quotes = queries.getQuoteRequests();
    
    // Parse JSON fields
    const formattedQuotes = quotes.map(q => ({
      ...q,
      products: JSON.parse(q.products),
      quantities: JSON.parse(q.quantities)
    }));

    res.json(formattedQuotes);
  } catch (error) {
    console.error('Error getting quote requests:', error);
    res.status(500).json({ error: 'Failed to fetch quote requests' });
  }
});

// Create quote request (public endpoint - no auth required)
router.post('/request', async (req, res) => {
  try {
    const {
      customer_email,
      company_name,
      products,
      quantities,
      message
    } = req.body;

    if (!customer_email || !products || !quantities) {
      return res.status(400).json({ 
        error: 'Email, products, and quantities are required' 
      });
    }

    // Find customer if exists
    let customerId = 0;
    const customer = queries.getCustomerByEmail(customer_email);
    if (customer) {
      customerId = customer.id;
    }

    // Create quote request
    const result = queries.createQuoteRequest({
      customer_id: customerId,
      customer_email,
      company_name: company_name || '',
      products,
      quantities,
      message: message || ''
    });

    // TODO: Send notification email to admin

    res.json({ 
      success: true,
      id: result.lastInsertRowid,
      message: 'Quote request submitted successfully. We will contact you soon.' 
    });

  } catch (error) {
    console.error('Error creating quote request:', error);
    res.status(500).json({ error: 'Failed to submit quote request' });
  }
});

// Get quote request by ID
router.get('/:id', verifyAuth, (req, res) => {
  try {
    const db = getDatabase();
    const quote = db.prepare('SELECT * FROM quote_requests WHERE id = ?').get(req.params.id);

    if (!quote) {
      return res.status(404).json({ error: 'Quote request not found' });
    }

    // Parse JSON fields
    quote.products = JSON.parse(quote.products);
    quote.quantities = JSON.parse(quote.quantities);

    res.json(quote);
  } catch (error) {
    console.error('Error getting quote request:', error);
    res.status(500).json({ error: 'Failed to fetch quote request' });
  }
});

// Respond to quote request
router.post('/:id/respond', verifyAuth, (req, res) => {
  try {
    const quoteId = req.params.id;
    const { quote_amount, quote_valid_until, quote_notes, status } = req.body;

    const db = getDatabase();
    const quote = db.prepare('SELECT * FROM quote_requests WHERE id = ?').get(quoteId);

    if (!quote) {
      return res.status(404).json({ error: 'Quote request not found' });
    }

    // Update quote
    db.prepare(`
      UPDATE quote_requests 
      SET quote_amount = ?,
          quote_valid_until = ?,
          quote_notes = ?,
          status = ?,
          responded_by = ?,
          responded_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      parseFloat(quote_amount) || null,
      quote_valid_until || null,
      quote_notes || '',
      status || 'responded',
      req.session.shop,
      quoteId
    );

    // TODO: Send quote email to customer with pricing and details

    res.json({ 
      success: true,
      message: 'Quote response sent successfully'
    });

  } catch (error) {
    console.error('Error responding to quote:', error);
    res.status(500).json({ error: 'Failed to respond to quote request' });
  }
});

// Update quote status
router.patch('/:id/status', verifyAuth, (req, res) => {
  try {
    const quoteId = req.params.id;
    const { status } = req.body;

    const db = getDatabase();
    const quote = db.prepare('SELECT * FROM quote_requests WHERE id = ?').get(quoteId);

    if (!quote) {
      return res.status(404).json({ error: 'Quote request not found' });
    }

    const validStatuses = ['pending', 'responded', 'accepted', 'rejected', 'expired'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    db.prepare(`
      UPDATE quote_requests 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, quoteId);

    res.json({ 
      success: true,
      message: 'Quote status updated successfully'
    });

  } catch (error) {
    console.error('Error updating quote status:', error);
    res.status(500).json({ error: 'Failed to update quote status' });
  }
});

// Delete quote request
router.delete('/:id', verifyAuth, (req, res) => {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM quote_requests WHERE id = ?').run(req.params.id);

    res.json({ 
      success: true,
      message: 'Quote request deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting quote request:', error);
    res.status(500).json({ error: 'Failed to delete quote request' });
  }
});

module.exports = router;