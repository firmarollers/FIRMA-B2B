// server/database/db.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs'); // Módulo File System para crear directorios

let db;

// --- CRÍTICO: RUTA ABSOLUTA (process.cwd()) ---
const dataDir = path.join(process.cwd(), 'data'); 
const finalDbPath = path.join(dataDir, 'b2b.db');
// -----------------------------------------------------------


function initDatabase() {
    // CRÍTICO: Aseguramos que el directorio 'data' exista antes de abrir la DB
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log(`✅ Directory ${dataDir} created.`);
    }

    db = new sqlite3.Database(finalDbPath, (err) => {
        if (err) {
            console.error('Error connecting to database:', err.message);
            return;
        }
        console.log('✅ Database connected to', finalDbPath);

        // Inicializa tablas
        db.serialize(() => {
            // Tabla principal de la aplicación
            db.run(`
                CREATE TABLE IF NOT EXISTS app_settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    shop_url TEXT UNIQUE,
                    access_token TEXT,
                    is_installed BOOLEAN,
                    last_updated DATETIME
                );
            `);
            
            // Tabla para clientes B2B
            db.run(`
                CREATE TABLE IF NOT EXISTS b2b_customers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    shopify_customer_id TEXT UNIQUE,
                    name TEXT,
                    email TEXT UNIQUE,
                    status TEXT DEFAULT 'pending', -- approved, pending, rejected
                    customer_group_id INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Tabla para grupos de clientes
            db.run(`
                CREATE TABLE IF NOT EXISTS customer_groups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE,
                    discount_percentage REAL,
                    min_order_amount REAL
                );
            `);

            // CRÍTICO: Nueva tabla para las sesiones de EXPRESS (usada por connect-sqlite3)
            db.run(`
                CREATE TABLE IF NOT EXISTS sessions_store (
                    sid TEXT PRIMARY KEY,
                    sess TEXT NOT NULL,
                    expire DATETIME
                );
            `, (err) => {
                if (err) {
                    console.error('Database initialization failed (sessions_store):', err.message);
                } else {
                    // Inicializar datos por defecto solo si no existen
                    db.get("SELECT COUNT(*) AS count FROM customer_groups", (err, row) => {
                        if (row.count === 0) {
                            db.run("INSERT INTO customer_groups (name, discount_percentage, min_order_amount) VALUES (?, ?, ?)", ["Default B2B", 15.0, 100.0], (err) => {
                                if (!err) {
                                    console.log('✅ Default customer groups created');
                                }
                            });
                        }
                    });

                    db.get("SELECT COUNT(*) AS count FROM app_settings", (err, row) => {
                        if (row.count === 0) {
                            console.log('✅ Default app settings created');
                        }
                    });
                    
                    console.log('✅ Database initialized successfully');
                }
            });
        });
    });
}

function getDatabase() {
    return db;
}

module.exports = {
    initDatabase,
    getDatabase
};
