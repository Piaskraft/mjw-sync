// src/feed.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { parse } = require('csv-parse/sync');

function toNum(val, def = 0) {
  if (val === null || val === undefined) return def;
  const n = Number(String(val).replace(',', '.').trim());
  return Number.isFinite(n) ? n : def;
}

function normalizeKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k).toLowerCase().replace(/\s+/g, '');
    out[key] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

function mapRow(n) {
  // standardowe pola, niezależnie od nazw w źródle
  const ean =
    n.ean || n.ean13 || n.ean_13 || n['ean:'] || n.kodean || n.kod_ean || null;

  const reference =
    n.reference || n.ref || n.sku || n.index || n.kod || null;

  const qty = toNum(n.qty ?? n.quantity ?? n.ilosc ?? n.na_magazynie ?? 0, 0);

  const net_pln = toNum(
    n.net_pln ?? n.cenanetto ?? n.cenanettopln ?? n.netto ?? n.price_pln ?? n.price_net_pln ?? 0,
    0
  );

  return { ean, reference, qty, net_pln };
}

async function readCsvText(feedUrl) {
  if (!feedUrl) throw new Error('Brak FEED_URL w .env');
  if (feedUrl.startsWith('file://')) {
    const p = feedUrl.replace('file://', '');
    const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    return fs.readFileSync(abs, 'utf8');
  } else {
    const { data } = await axios.get(feedUrl, { timeout: 30000, responseType: 'text' });
    return data;
  }
}

async function fetchFeed() {
  const feedUrl = process.env.FEED_URL;
  let csvText = await readCsvText(feedUrl);

  // zdejmij BOM jeśli jest
  if (csvText.charCodeAt(0) === 0xFEFF) csvText = csvText.slice(1);

  // parse CSV ze średnikiem i nagłówkami
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ';',
    relax_column_count: true,
    trim: true,
  });

  // normalizacja kluczy + wartości
  const normalized = records.map(r => mapRow(normalizeKeys(r)));
  return normalized;
}

module.exports = { fetchFeed };
