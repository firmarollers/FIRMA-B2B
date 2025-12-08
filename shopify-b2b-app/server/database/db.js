const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/b2b.db');
let db;

function initDatabase() {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    -- B2B Customers table
    CREATE TABLE IF NOT EXISTS b2b_customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopify_customer_id TEXT,
      email TEXT NOT NULL UNIQUE,
      company_name TEXT,
      tax_id TEXT,
      phone TEXT,
      website TEXT,
      status TEXT DEFAULT 'pending',
      group_id INTEGER,
      discount_percentage REAL DEFAULT 0,
      minimum_order_value REAL DEFAULT 0,
      maximum_order_value REAL DEFAULT 0,
      payment_terms TEXT DEFAULT 'immediate',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      approved_at DATETIME,
      approved_by TEXT
    );

    -- Customer Groups table
    CREATE TABLE IF NOT EXISTS customer_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      discount_percentage REAL DEFAULT 0,
      minimum_order_value REAL DEFAULT 0,
      maximum_order_value REAL DEFAULT 0,
      catalog_restrictions TEXT,
      payment_terms TEXT DEFAULT 'immediate',
      auto_approve INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Pricing Rules table
    CREATE TABLE IF NOT EXISTS pricing_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      value REAL NOT NULL,
      applies_to TEXT,
      product_ids TEXT,
      collection_ids TEXT,
      customer_group_id INTEGER,
      customer_id INTEGER,
      min_quantity INTEGER DEFAULT 1,
      max_quantity INTEGER,
      start_date DATETIME,
      end_date DATETIME,
      priority INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Orders table
    CREATE TABLE IF NOT EXISTS b2b_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopify_order_id TEXT UNIQUE,
      customer_id INTEGER NOT NULL,
      order_number TEXT,
      total_amount REAL,
      status TEXT DEFAULT 'pending_approval',
      approval_status TEXT DEFAULT 'pending',
      approved_by TEXT,
      approved_at DATETIME,
      rejection_reason TEXT,
      notes TEXT,
      requires_approval INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES b2b_customers(id)
    );

    -- Quote Requests table
    CREATE TABLE IF NOT EXISTS quote_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      customer_email TEXT NOT NULL,
      company_name TEXT,
      products TEXT NOT NULL,
      quantities TEXT NOT NULL,
      message TEXT,
      status TEXT DEFAULT 'pending',
      quote_amount REAL,
      quote_valid_until DATETIME,
      quote_notes TEXT,
      responded_by TEXT,
      responded_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES b2b_customers(id)
    );

    -- Catalog Restrictions table
    CREATE TABLE IF NOT EXISTS catalog_restrictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      action TEXT DEFAULT 'include',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES customer_groups(id)
    );

    -- App Settings table
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Sessions table
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      shop TEXT NOT NULL,
      state TEXT NOT NULL,
      isOnline INTEGER DEFAULT 0,
      accessToken TEXT,
      scope TEXT,
      expires DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for better performance
    CREATE INDEX IF NOT EXISTS idx_customers_email ON b2b_customers(email);
    CREATE INDEX IF NOT EXISTS idx_customers_status ON b2b_customers(status);
    CREATE INDEX IF NOT EXISTS idx_customers_group ON b2b_customers(group_id);
    CREATE INDEX IF NOT EXISTS idx_orders_customer ON b2b_orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON b2b_orders(status);
    CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quote_requests(customer_id);
    CREATE INDEX IF NOT EXISTS idx_quotes_status ON quote_requests(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_shop ON sessions(shop);
  `);

  // Insert default customer groups if none exist
  const groupCount = db.prepare('SELECT COUNT(*) as count FROM customer_groups').get();
  if (groupCount.count === 0) {
    const insertGroup = db.prepare(`
      INSERT INTO customer_groups (name, description, discount_percentage, minimum_order_value)
      VALUES (?, ?, ?, ?)
    `);

    insertGroup.run('VIP Wholesale', 'Premium wholesale customers with highest discounts', 30, 500);
    insertGroup.run('Standard Wholesale', 'Regular wholesale customers', 20, 250);
    insertGroup.run('Retailers', 'Small retailers and boutiques', 15, 100);
    
    console.log('✅ Default customer groups created');
  }

  // Insert default app settings if none exist
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM app_settings').get();
  if (settingsCount.count === 0) {
    const insertSetting = db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)');
    
    insertSetting.run('approval_required', 'true');
    insertSetting.run('auto_approve_orders', 'false');
    insertSetting.run('min_order_value', '0');
    insertSetting.run('notification_email', '');
    insertSetting.run('terms_and_conditions', 'Please review our B2B terms and conditions before placing orders.');
    
    console.log('✅ Default app settings created');
  }

  console.log('✅ Database initialized successfully');
  return db;
}

function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// Helper functions
const queries = {
  // B2B Customers
  getCustomers: () => {
    return db.prepare(`
      SELECT c.*, g.name as group_name 
      FROM b2b_customers c 
      LEFT JOIN customer_groups g ON c.group_id = g.id 
      ORDER BY c.created_at DESC
    `).all();
  },

  getCustomerById: (id) => {
    return db.prepare('SELECT * FROM b2b_customers WHERE id = ?').get(id);
  },

  getCustomerByEmail: (email) => {
    return db.prepare('SELECT * FROM b2b_customers WHERE email = ?').get(email);
  },

  createCustomer: (data) => {
    const stmt = db.prepare(`
      INSERT INTO b2b_customers 
      (email, company_name, tax_id, phone, website, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      data.email,
      data.company_name,
      data.tax_id,
      data.phone,
      data.website,
      data.status || 'pending',
      data.notes || ''
    );
  },

  updateCustomer: (id, data) => {
    const fields = Object.keys(data).map(key => `${key} = ?`).join(', ');
    const values = Object.values(data);
    const stmt = db.prepare(`UPDATE b2b_customers SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
    return stmt.run(...values, id);
  },

  approveCustomer: (id, approvedBy) => {
    const stmt = db.prepare(`
      UPDATE b2b_customers 
      SET status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = ?
      WHERE id = ?
    `);
    return stmt.run(approvedBy, id);
  },

  // Customer Groups
  getGroups: () => {
    return db.prepare('SELECT * FROM customer_groups ORDER BY name').all();
  },

  getGroupById: (id) => {
    return db.prepare('SELECT * FROM customer_groups WHERE id = ?').get(id);
  },

  createGroup: (data) => {
    const stmt = db.prepare(`
      INSERT INTO customer_groups 
      (name, description, discount_percentage, minimum_order_value, maximum_order_value, payment_terms)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      data.name,
      data.description,
      data.discount_percentage,
      data.minimum_order_value,
      data.maximum_order_value,
      data.payment_terms || 'immediate'
    );
  },

  // Pricing Rules
  getPricingRules: () => {
    return db.prepare('SELECT * FROM pricing_rules WHERE active = 1 ORDER BY priority DESC').all();
  },

  createPricingRule: (data) => {
    const stmt = db.prepare(`
      INSERT INTO pricing_rules 
      (name, type, value, applies_to, customer_group_id, min_quantity, priority, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      data.name,
      data.type,
      data.value,
      data.applies_to,
      data.customer_group_id,
      data.min_quantity || 1,
      data.priority || 0,
      data.active !== undefined ? data.active : 1
    );
  },

  // Orders
  getOrders: () => {
    return db.prepare(`
      SELECT o.*, c.email, c.company_name 
      FROM b2b_orders o 
      LEFT JOIN b2b_customers c ON o.customer_id = c.id 
      ORDER BY o.created_at DESC
    `).all();
  },

  getPendingOrders: () => {
    return db.prepare(`
      SELECT o.*, c.email, c.company_name 
      FROM b2b_orders o 
      LEFT JOIN b2b_customers c ON o.customer_id = c.id 
      WHERE o.approval_status = 'pending'
      ORDER BY o.created_at DESC
    `).all();
  },

  createOrder: (data) => {
    const stmt = db.prepare(`
      INSERT INTO b2b_orders 
      (shopify_order_id, customer_id, order_number, total_amount, status, requires_approval)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      data.shopify_order_id,
      data.customer_id,
      data.order_number,
      data.total_amount,
      data.status || 'pending_approval',
      data.requires_approval !== undefined ? data.requires_approval : 1
    );
  },

  approveOrder: (id, approvedBy) => {
    const stmt = db.prepare(`
      UPDATE b2b_orders 
      SET approval_status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = ?
      WHERE id = ?
    `);
    return stmt.run(approvedBy, id);
  },

  // Quote Requests
  getQuoteRequests: () => {
    return db.prepare('SELECT * FROM quote_requests ORDER BY created_at DESC').all();
  },

  createQuoteRequest: (data) => {
    const stmt = db.prepare(`
      INSERT INTO quote_requests 
      (customer_id, customer_email, company_name, products, quantities, message, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      data.customer_id || 0,
      data.customer_email,
      data.company_name,
      JSON.stringify(data.products),
      JSON.stringify(data.quantities),
      data.message,
      'pending'
    );
  },

  // Settings
  getSetting: (key) => {
    const result = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    return result ? result.value : null;
  },

  setSetting: (key, value) => {
    const stmt = db.prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `);
    return stmt.run(key, value, value);
  },

  // Stats
  getStats: () => {
    const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM b2b_customers').get().count;
    const pendingApprovals = db.prepare('SELECT COUNT(*) as count FROM b2b_customers WHERE status = ?').get('pending').count;
    const activeGroups = db.prepare('SELECT COUNT(*) as count FROM customer_groups').get().count;
    const totalOrders = db.prepare('SELECT COUNT(*) as count FROM b2b_orders').get().count;

    return {
      totalCustomers,
      pendingApprovals,
      activeGroups,
      totalOrders
    };
  }
};

module.exports = {
  initDatabase,
  getDatabase,
  queries
};