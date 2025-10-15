// src/check.js
require('dotenv').config();

const MIN_NET_PLN = Number(process.env.MIN_NET_PLN ?? 0.01);
const MAX_NET_PLN = Number(process.env.MAX_NET_PLN ?? 1e9);
const MIN_QTY = Number(process.env.MIN_QTY ?? 0);
const MAX_QTY = Number(process.env.MAX_QTY ?? 1e9);
const MIN_RATE = Number(process.env.MIN_RATE ?? 0.1);
const MAX_RATE = Number(process.env.MAX_RATE ?? 100);

function isNum(n) { return typeof n === 'number' && !isNaN(n) && isFinite(n); }

function checkRate(rate) {
  if (!isNum(rate)) return { ok: false, reason: 'rate_not_number', rate };
  if (rate < MIN_RATE || rate > MAX_RATE) return { ok: false, reason: 'rate_out_of_range', rate, range:[MIN_RATE,MAX_RATE] };
  return { ok: true };
}

function normalizeKey(row) {
  return row.ean || row.reference || null;
}

function checkRow(row) {
  const key = normalizeKey(row);
  const qty = Number(row.qty ?? 0);
  const net_pln = Number(row.net_pln ?? 0);

  if (!key) return { ok: false, reason: 'missing_key', row };
  if (!isNum(net_pln) || net_pln <= 0) return { ok: false, reason: 'bad_net_pln', net_pln };
  if (net_pln < MIN_NET_PLN || net_pln > MAX_NET_PLN) return { ok: false, reason: 'net_pln_out_of_range', net_pln, range:[MIN_NET_PLN,MAX_NET_PLN] };
  if (!isNum(qty) || qty < MIN_QTY || qty > MAX_QTY) return { ok: false, reason: 'qty_out_of_range', qty, range:[MIN_QTY,MAX_QTY] };
  return { ok: true };
}

module.exports = { checkRate, checkRow, normalizeKey };
