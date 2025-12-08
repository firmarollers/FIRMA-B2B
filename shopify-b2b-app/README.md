# Shopify B2B Wholesale Manager

A comprehensive B2B and wholesale management app for Shopify stores, with full compatibility for the Ritual theme.

## 🎯 Features

### Core Functionality
- ✅ **Custom Pricing** - Percentage discounts or fixed prices per customer/group
- ✅ **Exclusive Catalogs** - Restrict products/collections for wholesale customers
- ✅ **Order Requirements** - Set minimum and maximum order values
- ✅ **Quote Requests** - Allow customers to request custom quotes
- ✅ **Order Approval** - Review and approve B2B orders before fulfillment
- ✅ **Customer Management** - Comprehensive dashboard for B2B customer administration
- ✅ **Registration System** - Public form with approval workflow

### Customer Groups
- Create multiple wholesale tiers (VIP, Standard, Retailers)
- Group-wide pricing rules
- Minimum order requirements per group
- Payment terms configuration

### Admin Dashboard
- Real-time statistics
- Pending approval queue
- Customer management
- Order approval workflow
- Pricing rule configuration
- Settings management

## 🏗️ Architecture

```
shopify-b2b-app/
├── server/
│   ├── index.js              # Main Express server
│   ├── database/
│   │   └── db.js            # SQLite database setup
│   └── routes/
│       ├── auth.js          # Shopify OAuth
│       ├── api.js           # Main API endpoints
│       ├── customers.js     # B2B customer CRUD
│       ├── pricing.js       # Pricing rules
│       ├── orders.js        # Order management
│       ├── quotes.js        # Quote requests
│       └── storefront.js    # Public API
├── storefront/
│   ├── b2b-integration.js   # Frontend integration
│   ├── registration-form.js # B2B signup widget
│   └── b2b-styles.css      # Ritual-compatible styles
├── data/                    # SQLite database (auto-created)
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Shopify Partner Account
- GitHub Account
- Render.com Account (or alternative hosting)

### Installation

1. **Clone and Setup**
```bash
git clone <your-repo-url>
cd shopify-b2b-app
npm install
```

2. **Configure Environment**
```bash
cp .env.example .env
# Edit .env with your Shopify credentials
```

3. **Create Database Directory**
```bash
mkdir data
```

4. **Test Locally**
```bash
npm run dev
# Visit http://localhost:3000
```

5. **Deploy to Render**
- Follow the detailed installation guide in the artifacts
- Configure environment variables in Render dashboard
- Deploy from GitHub

## 📦 Database Schema

### Tables
- `b2b_customers` - B2B customer records
- `customer_groups` - Wholesale tiers
- `pricing_rules` - Custom pricing configuration
- `b2b_orders` - Order approval queue
- `quote_requests` - Customer quote requests
- `catalog_restrictions` - Product/collection access control
- `app_settings` - Application configuration
- `sessions` - Shopify OAuth sessions

## 🎨 Theme Integration (Ritual)

### Method 1: App Embed (Recommended)
1. Go to Shopify Admin → Online Store → Themes
2. Click Customize on Ritual theme
3. Enable "B2B Wholesale Manager" in App Embeds
4. Save

### Method 2: Manual Integration
Add to `theme.liquid` before `</body>`:
```liquid
{% if customer.tags contains 'b2b' or customer.tags contains 'wholesale' %}
  <script src="https://your-app.onrender.com/storefront/b2b-integration.js"></script>
  <link rel="stylesheet" href="https://your-app.onrender.com/storefront/b2b-styles.css">
{% endif %}
```

### Registration Page Setup
1. Create new page: "Wholesale Registration"
2. Add this HTML:
```html
<div id="b2b-registration-form"></div>
<script src="https://your-app.onrender.com/storefront/registration-form.js"></script>
```

## 🔐 API Endpoints

### Admin API (Requires Authentication)
- `GET /api/stats` - Dashboard statistics
- `GET /api/customers` - List B2B customers
- `POST /api/customers/:id/approve` - Approve customer
- `GET /api/groups` - List customer groups
- `POST /api/groups` - Create customer group
- `GET /api/pricing` - List pricing rules
- `POST /api/pricing` - Create pricing rule
- `GET /api/orders` - List B2B orders
- `POST /api/orders/:id/approve` - Approve order
- `GET /api/quotes` - List quote requests
- `POST /api/quotes/:id/respond` - Respond to quote

### Storefront API (Public)
- `GET /storefront-api/customer-status?email=...` - Check B2B status
- `POST /storefront-api/calculate-price` - Get B2B pricing
- `POST /storefront-api/validate-cart` - Validate order requirements
- `POST /api/customers` - Submit B2B application
- `POST /quotes/request` - Submit quote request

## 🎯 Usage Examples

### Creating a Customer Group
```javascript
POST /api/groups
{
  "name": "VIP Wholesale",
  "description": "Top-tier wholesale customers",
  "discount_percentage": 30,
  "minimum_order_value": 500,
  "payment_terms": "net30"
}
```

### Approving a Customer
```javascript
POST /api/customers/123/approve
// Customer automatically tagged in Shopify with 'b2b, wholesale'
```

### Creating Pricing Rule
```javascript
POST /api/pricing
{
  "name": "Bulk Discount - 50+ units",
  "type": "percentage",
  "value": 35,
  "applies_to": "all",
  "customer_group_id": 1,
  "min_quantity": 50
}
```

## 🔧 Configuration

### App Settings (via Dashboard)
- Approval required for orders
- Auto-approve orders
- Minimum order value (global)
- Notification email
- Terms and conditions

### Customer Groups
- Discount percentage
- Minimum/maximum order values
- Payment terms (immediate, net30, net60)
- Catalog restrictions
- Auto-approval

## 📊 Monitoring

### Logs
Check Render logs for errors:
```bash
# In Render dashboard: Logs tab
```

### Database
Access database for debugging:
```bash
# Connect to Render shell
sqlite3 data/b2b.db
```

## 🐛 Troubleshooting

### App won't install
- Verify Shopify API credentials
- Check redirect URLs match exactly
- Ensure scopes are correct

### Pricing not showing
- Verify customer has 'b2b' or 'wholesale' tag
- Check customer approval status
- Clear browser cache
- Verify storefront scripts are loading

### Database errors
- Render free tier sleeps after 15 min inactivity
- First request takes ~30 seconds to wake up
- Consider paid tier for production

### Theme integration issues
- Ensure app embed is enabled
- Check browser console for JavaScript errors
- Verify script URLs are correct

## 🔒 Security

- OAuth 2.0 for Shopify authentication
- Session-based authentication
- HTTPS enforced in production
- SQL injection prevention with prepared statements
- XSS protection with sanitized inputs

## 📈 Scaling

### Free Tier Limitations
- Render: 750 hours/month, sleeps after 15 min
- SQLite: Single file database
- Suitable for: Up to 100 B2B customers, low traffic

### Upgrading for Production
1. Upgrade Render to paid tier ($7/month)
2. Consider PostgreSQL for larger databases
3. Implement caching (Redis)
4. Add CDN for static assets
5. Set up monitoring (Sentry, LogRocket)

## 🤝 Support

- **Shopify API Docs**: https://shopify.dev
- **Render Docs**: https://render.com/docs
- **Express.js**: https://expressjs.com

## 📝 License

MIT License - feel free to modify and use for your projects

## 🎉 Credits

Built with:
- Express.js
- SQLite (better-sqlite3)
- Shopify API
- Vanilla JavaScript (no framework dependencies for storefront)

---

**Note**: This app is designed for the Ritual theme but can be adapted for other themes with minor CSS adjustments.