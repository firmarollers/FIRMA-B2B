// server/db/sessionStorage.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Ruta a la base de datos SQLite (en la carpeta 'data')
const dbPath = path.join(__dirname, '..', '..', 'data', 'b2b.db');
const db = new sqlite3.Database(dbPath);

// Crear tabla para sesiones si no existe
db.run(`
  CREATE TABLE IF NOT EXISTS shop_sessions (
    shop TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    scope TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const sessionStorage = {
  // Guardar o actualizar sesión de una tienda
  async storeSession(session) {
    return new Promise((resolve, reject) => {
      const { id, shop, accessToken, scope } = session;
      db.run(
        `INSERT OR REPLACE INTO shop_sessions (shop, access_token, scope) 
         VALUES (?, ?, ?)`,
        [shop, accessToken, scope],
        function(err) {
          if (err) reject(err);
          else resolve(true);
        }
      );
    });
  },

  // Cargar sesión de una tienda
  async loadSession(id) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM shop_sessions WHERE shop = ?`,
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  },

  // Borrar sesión (para desinstalación)
  async deleteSession(id) {
    return new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM shop_sessions WHERE shop = ?`,
        [id],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  },

  // Buscar sesión por tienda (alias para loadSession)
  async findSessionByShop(shop) {
    return this.loadSession(shop);
  }
};

module.exports = sessionStorage;
