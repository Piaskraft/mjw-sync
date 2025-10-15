const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

async function fetchFeed() {
  const url = process.env.FEED_URL;
  if (!url) throw new Error('Brak FEED_URL w .env');

  let csvText;
  if (url.startsWith('file://')) {
    const p = url.replace('file://', '');
    const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    csvText = fs.readFileSync(abs, 'utf8');
  } else {
    const { data } = await axios.get(url, { responseType: 'text', timeout: 30000 });
    csvText = data;
  }

  const records = parse(csvText, { columns: true, delimiter: ';', trim: true, skip_empty_lines: true });

  return records.map(r => ({
    ean: String(r.EAN || r.ean || r.ean13 || '').trim() || null,
    reference: String(r.reference || r.SKU || '').trim() || null,
    qty: Number(r.QTY || r.qty || r.quantity || 0),
    net_pln: Number(r.NET_PLN || r.price_pln || r.netto_pln || r.price_net_pln || 0),
  })).filter(r => r.ean || r.reference);
}

module.exports = { fetchFeed };
