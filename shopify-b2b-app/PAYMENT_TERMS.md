# Payment Terms & Deferred Payments (Optional Feature)

## ⚠️ Important Notice

This feature is **OPTIONAL** and **COMMENTED OUT** in the codebase. It requires:
- Additional payment gateway integration (Stripe Invoicing, QuickBooks, etc.)
- Credit risk assessment procedures
- Collection management systems
- Legal terms and conditions review

**Only implement this if you have proper accounting and collection systems in place.**

---

## Overview

The B2B app includes a foundational structure for deferred payment terms, but it's intentionally disabled by default. This document explains how to enable and configure it if needed.

## Current Payment Terms in Database

The `customer_groups` and `b2b_customers` tables already include a `payment_terms` field with these options:

- **immediate** - Payment required at checkout (DEFAULT)
- **net30** - Payment due within 30 days
- **net60** - Payment due within 60 days
- **net90** - Payment due within 90 days
- **prepay** - Prepayment required before order processing

## How It Currently Works (Disabled)

1. Payment terms are stored in customer/group records
2. They're displayed in the admin dashboard
3. **BUT** they don't affect Shopify checkout (requires additional integration)

## Enabling Deferred Payments

### Option 1: Manual Invoice Management

**Best for:** Small volume, established customer relationships

**Steps:**
1. Customer places order normally
2. Admin approves order in B2B dashboard
3. You manually create and send invoice
4. Mark order as paid when payment received
5. Fulfill order

**Implementation:**
- Already built into order approval system
- Just use "Approved" status to trigger your manual invoicing process
- No code changes needed

### Option 2: Shopify Draft Orders

**Best for:** Medium volume, some automation needed

**Implementation:**

Add this function to `server/routes/orders.js`:

```javascript
// Create draft order with payment terms
async function createDraftOrderWithTerms(order, customer) {
  const shop = req.session.shop;
  const accessToken = req.session.accessToken;

  const draftOrder = {
    line_items: order.items,
    customer: {
      id: customer.shopify_customer_id
    },
    note: `Payment Terms: ${customer.payment_terms}`,
    tags: 'b2b, deferred-payment',
    use_customer_default_address: true
  };

  const response = await axios.post(
    `https://${shop}/admin/api/2024-01/draft_orders.json`,
    { draft_order: draftOrder },
    {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data.draft_order;
}
```

**Workflow:**
1. Customer requests quote or places order
2. Admin creates draft order with terms
3. Send invoice link to customer
4. Customer completes payment when ready
5. Auto-fulfill after payment

### Option 3: Stripe Invoicing Integration

**Best for:** Higher volume, full automation

**Requirements:**
- Stripe account
- Stripe Invoicing enabled
- Customer credit cards on file

**Implementation Steps:**

1. **Install Stripe SDK:**
```bash
npm install stripe
```

2. **Add to `.env`:**
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

3. **Create Stripe customer when approving B2B:**

```javascript
// In server/routes/customers.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function createStripeCustomer(customer) {
  const stripeCustomer = await stripe.customers.create({
    email: customer.email,
    name: customer.company_name,
    metadata: {
      shopify_customer_id: customer.shopify_customer_id,
      b2b_customer_id: customer.id
    }
  });

  // Save Stripe customer ID to database
  queries.updateCustomer(customer.id, {
    stripe_customer_id: stripeCustomer.id
  });

  return stripeCustomer;
}
```

4. **Create invoice when order approved:**

```javascript
async function createStripeInvoice(order, customer) {
  // Create invoice
  const invoice = await stripe.invoices.create({
    customer: customer.stripe_customer_id,
    collection_method: 'send_invoice',
    days_until_due: getNetTermsDays(customer.payment_terms),
    description: `Order ${order.order_number}`,
    metadata: {
      shopify_order_id: order.shopify_order_id,
      b2b_order_id: order.id
    }
  });

  // Add line items
  for (const item of order.items) {
    await stripe.invoiceItems.create({
      customer: customer.stripe_customer_id,
      invoice: invoice.id,
      amount: Math.round(item.price * 100), // Stripe uses cents
      currency: 'usd',
      description: item.title
    });
  }

  // Finalize and send
  const finalInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
  await stripe.invoices.sendInvoice(finalInvoice.id);

  return finalInvoice;
}

function getNetTermsDays(paymentTerms) {
  switch(paymentTerms) {
    case 'net30': return 30;
    case 'net60': return 60;
    case 'net90': return 90;
    default: return 0;
  }
}
```

5. **Set up webhook handler for payment confirmations:**

```javascript
// Add to server/index.js
app.post('/webhooks/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object;
    
    // Update order status
    const db = getDatabase();
    db.prepare(`
      UPDATE b2b_orders 
      SET status = 'paid', updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(invoice.metadata.shopify_order_id);

    // Trigger fulfillment in Shopify
    // ... fulfillment logic
  }

  res.json({received: true});
});
```

### Option 4: QuickBooks Integration

**Best for:** Businesses already using QuickBooks

**Steps:**
1. Install `node-quickbooks` package
2. Set up OAuth with QuickBooks
3. Create customer in QuickBooks when approved
4. Create invoice in QuickBooks when order approved
5. Sync payment status back to Shopify

**Code example:**
```javascript
const QuickBooks = require('node-quickbooks');

const qbo = new QuickBooks(
  process.env.QB_CONSUMER_KEY,
  process.env.QB_CONSUMER_SECRET,
  process.env.QB_ACCESS_TOKEN,
  false, // production
  process.env.QB_REALM_ID
);

// Create customer
qbo.createCustomer({
  DisplayName: customer.company_name,
  PrimaryEmailAddr: { Address: customer.email }
}, (err, qbCustomer) => {
  // Save QB customer ID
});

// Create invoice
qbo.createInvoice({
  CustomerRef: { value: customer.qb_customer_id },
  Line: order.items.map(item => ({
    Amount: item.price,
    DetailType: 'SalesItemLineDetail',
    SalesItemLineDetail: {
      ItemRef: { value: item.qb_item_id }
    }
  }))
}, (err, invoice) => {
  // Handle invoice creation
});
```

---

## Risk Management

### Before Enabling Deferred Payments:

1. **Credit Assessment**
   - Require business registration documents
   - Check credit references
   - Set credit limits per customer
   - Review financial statements for large accounts

2. **Legal Protection**
   - Draft proper Terms & Conditions
   - Include late payment fees
   - Define collection procedures
   - Consult with lawyer

3. **Monitoring System**
   - Track aging receivables
   - Set up automatic payment reminders
   - Flag overdue accounts
   - Suspend ordering for delinquent accounts

4. **Collection Process**
   - 1st reminder: 5 days before due
   - 2nd reminder: On due date
   - 3rd reminder: 7 days overdue
   - Collection agency: 30+ days overdue

### Add These Fields to Database:

```sql
ALTER TABLE b2b_customers ADD COLUMN credit_limit REAL DEFAULT 0;
ALTER TABLE b2b_customers ADD COLUMN current_balance REAL DEFAULT 0;
ALTER TABLE b2b_customers ADD COLUMN overdue_amount REAL DEFAULT 0;
ALTER TABLE b2b_customers ADD COLUMN last_payment_date DATETIME;

ALTER TABLE b2b_orders ADD COLUMN payment_due_date DATETIME;
ALTER TABLE b2b_orders ADD COLUMN payment_received_date DATETIME;
ALTER TABLE b2b_orders ADD COLUMN payment_status TEXT DEFAULT 'pending';
```

---

## User Interface Changes

If you enable payment terms, update the admin dashboard to show:

1. **Customer List:**
   - Current balance
   - Credit limit
   - Payment status (current/overdue)

2. **Order List:**
   - Payment due date
   - Days until/overdue
   - Payment status

3. **New Reports Section:**
   - Aging receivables (30/60/90 days)
   - Payment collection rate
   - Average days to payment
   - Overdue accounts list

---

## Testing Payment Terms

1. **Test Mode:**
   - Use Stripe test mode
   - Create test customers with different terms
   - Place test orders
   - Verify invoice generation
   - Test webhook handling

2. **Pilot Program:**
   - Start with 2-3 trusted customers
   - Offer only net30 initially
   - Monitor closely for first month
   - Collect feedback
   - Adjust process as needed

---

## Recommended Approach

**For most businesses starting out:**

1. **Start with prepay or immediate payment only**
2. **After 3-6 months of good relationship:**
   - Offer net30 to select customers
   - Require personal guarantee or deposit
3. **After proven payment history:**
   - Extend to net60 for best customers
   - Increase credit limits gradually

**Remember:** Cash flow is critical for small businesses. Don't extend terms you can't afford!

---

## Summary

✅ **Database structure already supports payment terms**
✅ **Admin interface shows payment terms**
❌ **Payment processing not automated (by design)**

**To enable:**
- Choose integration method above
- Implement payment tracking
- Set up collection procedures
- Add legal protections
- Start slowly with trusted customers

**Questions to ask yourself:**
- Can my business afford 30-90 day payment delays?
- Do I have systems to track and collect payments?
- Am I prepared to handle non-payment situations?
- Do I have proper insurance and legal protection?

If you're unsure about any of these, stick with immediate payment until you have proper systems in place.