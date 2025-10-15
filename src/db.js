// src/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(process.cwd(), 'cache.sqlite'));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,                 -- EAN lub SKU (fallback)
      id_product INTEGER NOT NULL,
      id_product_attribute INTEGER NOT NULL DEFAULT 0,
      last_price_net_eur REAL,
      last_qty INTEGER,
      updated_at TEXT
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_cache_prod ON cache(id_product, id_product_attribute)`);
});

function getCache(key) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM cache WHERE key = ?`, [key], (err, row) => (err ? reject(err) : resolve(row || null)));
  });
}

function upsertCache({ key, id_product, id_product_attribute = 0, last_price_net_eur, last_qty }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO cache (key, id_product, id_product_attribute, last_price_net_eur, last_qty, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET
         id_product = excluded.id_product,
         id_product_attribute = excluded.id_product_attribute,
         last_price_net_eur = excluded.last_price_net_eur,
         last_qty = excluded.last_qty,
         updated_at = datetime('now')`,
      [key, id_product, id_product_attribute, last_price_net_eur, last_qty],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

module.exports = { db, getCache, upsertCache };
