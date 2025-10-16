// src/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'cache.sqlite');
const db = new sqlite3.Database(DB_PATH);

// ── INIT ───────────────────────────────────────────────────────────────────────
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,                 -- EAN lub SKU
      id_product INTEGER NOT NULL,
      id_product_attribute INTEGER NOT NULL DEFAULT 0,
      last_price_net_eur REAL,
      last_qty INTEGER,
      updated_at TEXT
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_cache_prod ON cache(id_product, id_product_attribute)`);
});

// ── HELPERS ───────────────────────────────────────────────────────────────────
function getCache(key) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM cache WHERE key = ?`, [key], (err, row) =>
      err ? reject(err) : resolve(row || null)
    );
  });
}

/**
 * Upsert z poduszką bezpieczeństwa:
 * - w JS: wymuszamy liczbę i fallback 0
 * - w SQL: COALESCE(...) gwarantuje 0 nawet, jeśli dotrze NULL
 */
function upsertCache({ key, id_product, id_product_attribute = 0, last_price_net_eur, last_qty }) {
  // JS-owe zabezpieczenia
  const prodId = Number.isFinite(Number(id_product)) ? Number(id_product) : 0;
  let attrId = Number.isFinite(Number(id_product_attribute)) ? Number(id_product_attribute) : 0;
  if (attrId < 0) attrId = 0;

  const price = Number.isFinite(Number(last_price_net_eur)) ? Number(last_price_net_eur) : null;
  const qty   = Number.isFinite(Number(last_qty)) ? Number(last_qty) : null;

  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO cache (key, id_product, id_product_attribute, last_price_net_eur, last_qty, updated_at)
      VALUES (?, ?, COALESCE(?, 0), ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        id_product            = excluded.id_product,
        id_product_attribute  = COALESCE(excluded.id_product_attribute, 0),
        last_price_net_eur    = excluded.last_price_net_eur,
        last_qty              = excluded.last_qty,
        updated_at            = datetime('now')
    `;

    db.run(sql, [key, prodId, attrId, price, qty], (err) =>
      err ? reject(err) : resolve()
    );
  });
}

module.exports = { db, getCache, upsertCache };
