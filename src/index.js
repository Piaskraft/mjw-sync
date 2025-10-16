// src/index.js
const cron = require('node-cron');
require('dotenv').config();

const { fetchFeed } = require('./feed');
const {
  findByEAN,
  findByRefAny,
  updateProductPrice,
  getStockAvailableId,
  updateStockQuantity,
  setProductNetPrice,
} = require('./prestashop');

const { getCache, upsertCache } = require('./db');
const { getRate } = require('./rate');
const { checkRate, checkRow, normalizeKey } = require('./check');

const isReal = process.argv.includes('--real') || process.env.REAL === '1';
const ENDING = Number(process.env.ENDING ?? 0.99);
const MARGIN = Number(process.env.MARGIN ?? 0.34);
const MAX_DELTA = Number(process.env.MAX_DELTA ?? 0.10);
const RPS = Number(process.env.REQS_PER_SEC ?? 5);

const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function applyEnding(n, ending = 0.99) {
  const base = Math.floor(n);
  const withEnd = base + ending;
  return withEnd < n ? base + 1 + ending : withEnd;
}

function capDelta(oldVal, newVal, maxDelta) {
  if (!oldVal || oldVal <= 0) return newVal;
  const delta = Math.abs(newVal - oldVal) / oldVal;
  if (delta <= maxDelta) return newVal;
  const dir = newVal > oldVal ? 1 : -1;
  return Number((oldVal * (1 + dir * maxDelta)).toFixed(2));
}

function appendLog(data) {
  const now = new Date();
  const ts = now.toISOString().replace(/[:T]/g, '_').slice(0, 15);
  const mode = isReal ? 'real' : 'dry';
  const logPath = path.join('logs', `${mode}_${ts}.jsonl`);
  fs.appendFileSync(logPath, JSON.stringify(data) + '\n');
}

function appendError(data) {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const logPath = path.join(process.cwd(), 'logs', `errors_${ts}.jsonl`);
  fs.appendFileSync(logPath, JSON.stringify(data) + '\n');
}

function ensureLogsDir() {
  const dir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureLogsDir();

async function runOnce() {
  try {
    console.log(`Start (${isReal ? 'REAL' : 'DRY'})`);
    const rate = await getRate();
    console.log(`Kurs PLN/EUR: ${rate}`);

    const rateCheck = checkRate(rate);
    if (!rateCheck.ok) {
      appendError({ time: new Date().toISOString(), type: 'rate', ...rateCheck });
      console.error('⛔ Nieprawidłowy kurs, przerywam:', rateCheck);
      return;
    }

    const feed = await fetchFeed();

    // deduplikacja po ean/reference
    const seen = new Set();
    const uniqueFeed = feed.filter((row) => {
      const key = row.ean || row.reference;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (const row of uniqueFeed) {
      await sleep(1000 / RPS);

      const key = normalizeKey(row);
      const qty = Number(row.qty ?? 0);
      const net_pln = Number(row.net_pln ?? 0);

      const rowCheck = checkRow({ ...row, qty, net_pln });
      if (!rowCheck.ok) {
        appendError({ time: new Date().toISOString(), type: 'row', key, ...rowCheck, row });
        console.log('⏭️ pomijam (walidacja)', rowCheck.reason, 'key=', key);
        continue;
      }

      // --- znajdź produkt ---
      let p = null;

      if (process.env.FORCE_ID) {
        // tryb testowy – wymuszone ID
        const { findById } = require('./prestashop');
        const forced = await findById(Number(process.env.FORCE_ID));
        if (!forced) {
          console.log('❓ Brak produktu po FORCE_ID =', process.env.FORCE_ID);
          continue;
        }
        p = { ...forced, attrId: forced.id_default_combination || 0 };
      } else {
        // standardowe wyszukiwanie
        if (row.ean) p = await findByEAN(String(row.ean).trim());
        if (!p && row.reference) p = await findByRefAny(String(row.reference).trim());
        if (!p) {
          console.log(`❓ Brak produktu w Preście dla ${key}`);
          continue;
        }
      }

      // --- ustal attrId (id_product_attribute) BEZBŁĘDNIE ---
      let attrIdRaw = (p && p.attrId !== undefined) ? p.attrId : p?.id_default_combination;
      let attrId = Number(attrIdRaw);
      if (!Number.isFinite(attrId) || attrId < 0) attrId = 0;
      console.log(`↪ attrId użyty do stocków = ${attrId}`);

      // --- wylicz nową cenę netto EUR ---
      let eurNet = net_pln / rate;
      eurNet = eurNet * (1 + MARGIN);
      eurNet = Number(eurNet.toFixed(2));
      eurNet = applyEnding(eurNet, ENDING);
      eurNet = Number(eurNet.toFixed(2));

      // --- cache / limit zmiany ---
      const cached = await getCache(key);
      const old = Number(cached?.last_price_net_eur || 0);
      const finalPrice = capDelta(old, eurNet, MAX_DELTA);

      console.log(
        `🔁 ${key} id=${p.id} netEUR old=${old || '-'} -> new=${eurNet} (capped=${finalPrice}) qty=${qty}`
      );

      if (isReal) {
        try {
          await updateProductPrice(p.id, finalPrice);
        } catch (e) {
          console.warn(`⚠️ pełny PUT nie wyszedł, próbuję minimalny PUT (id+price) dla id=${p.id}`);
          await setProductNetPrice(p.id, finalPrice);
        }

        const sa_id = await getStockAvailableId(p.id, attrId);
        if (sa_id) {
          await updateStockQuantity(sa_id, qty);
        } else {
          appendError({ time: new Date().toISOString(), type: 'stock', key, reason: 'no_stock_available', id: p.id, attrId });
          console.log('⚠️ Brak stock_available dla', { product: p.id, attrId });
        }
      }

      await upsertCache({
        key,
        id_product: Number(p.id),
        id_product_attribute: Number.isFinite(attrId) ? attrId : 0, // ⬅️ twardy fallback
        last_price_net_eur: Number(finalPrice.toFixed(2)),
        last_qty: qty,
      });

      appendLog({
        time: new Date().toISOString(),
        key,
        id: Number(p.id),
        old_price: old,
        new_price: eurNet,
        final_price: finalPrice,
        qty,
        rate,
        mode: isReal ? 'REAL' : 'DRY',
      });
    }

    console.log(`✅ Zakończono (${isReal ? 'REAL' : 'DRY'})`);
  } catch (e) {
    console.error('❌ Błąd:', e?.message || e);
    if (process.argv.includes('--once')) {
      process.exit(1);
    }
  }
}

if (process.argv.includes('--once')) {
  runOnce();
} else {
  let running = false;
  cron.schedule(
    '0 * * * *',
    async () => {
      if (running) {
        console.log('⏳ Poprzednia instancja jeszcze działa – pomijam ten tick');
        return;
      }
      running = true;
      console.log('⏰ CRON: start');
      try {
        await runOnce();
      } catch (e) {
        console.error('❌ CRON błąd:', e?.message || e);
      } finally {
        running = false;
      }
    },
    { timezone: 'Europe/Berlin' }
  );
}
