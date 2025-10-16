// src/prestashop.js
const axios = require('axios');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');

// atrybut przestrzeni nazw – Presta lubi mieć xlink przy PUT
const NS_ATTR = { '@_xmlns:xlink': 'http://www.w3.org/1999/xlink' };

const api = axios.create({
  baseURL: process.env.PS_API_URL,
  auth: { username: process.env.PS_API_KEY, password: '' },
  headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
  timeout: 20000,
  paramsSerializer: {
    serialize: (params) => {
      const usp = new URLSearchParams();
      for (const [k, v] of Object.entries(params || {})) usp.append(k, v);
      // Presta wymaga dosłownych [] w parametrach
      return usp.toString().replace(/%5B/g, '[').replace(/%5D/g, ']');
    }
  }
});

const parser = new XMLParser({ ignoreAttributes: false });
const builder = new XMLBuilder({ ignoreAttributes: false });

function parseXml(xml) { return parser.parse(xml); }
function firstOrNull(x) {
  if (!x) return null;
  if (Array.isArray(x)) return x[0] ?? null;
  if (typeof x === 'object') return x;
  return null;
}

/* ----------------------- HTTP helpers z retry ----------------------- */
async function apiGet(path, params = {}, retries = 3, delay = 1000) {
  try {
    const { data } = await api.get(path, { params });
    return parseXml(data);
  } catch (err) {
    if (retries > 0) {
      const wait = delay * 2;
      console.warn(`⚠️ apiGet retry ${4 - retries}/3 za ${wait}ms`, path);
      await new Promise(r => setTimeout(r, wait));
      return apiGet(path, params, retries - 1, wait);
    }
    const status = err.response?.status;
    const body   = err.response?.data;
    console.error(`❌ apiGet failed: ${path} status=${status}\n${body || err.message}`);
    throw err;
  }
}

async function apiPut(path, body, retries = 3, delay = 1000) {
  try {
    const { data } = await api.put(path, body);
    return parseXml(data);
  } catch (err) {
    if (retries > 0) {
      const wait = delay * 2;
      console.warn(`⚠️ apiPut retry ${4 - retries}/3 za ${wait}ms`, path);
      await new Promise(r => setTimeout(r, wait));
      return apiPut(path, body, retries - 1, wait);
    }
    const status = err.response?.status;
    const body   = err.response?.data;
    console.error(`❌ apiPut failed: ${path} status=${status}\n${body || err.message}`);
    throw err;
  }
}

/* --------------------------- READ-y / FIND-y --------------------------- */
// Prosty READ po ID – brakowało, stąd błąd "findById is not a function"
async function findById(id) {
  const obj = await apiGet(`/products/${id}`);
  return obj?.prestashop?.product ?? null;
}

async function getProductLight(id) {
  const obj = await apiGet(`/products/${id}`);
  return obj?.prestashop?.product || null;
}

async function readProductSummary(id) {
  const prod = await getProductLight(id);
  if (!prod) return null;
  return {
    id: Number(prod.id),
    ean13: prod.ean13 || null,
    reference: prod.reference || null,
    price: Number(prod.price),
    id_default_combination: Number(prod.id_default_combination || 0),
  };
}

async function findByEAN(ean13) {
  const obj = await apiGet('/products', {
    'filter[ean13]': `[${ean13}]`,
    limit: 1,
    display: '[id,ean13,reference,price,id_default_combination]'
  });
  const p = firstOrNull(obj?.prestashop?.products?.product);
  return p ? {
    id: Number(p.id),
    ean13: p.ean13 || null,
    reference: p.reference || null,
    price: Number(p.price),
    id_default_combination: Number(p.id_default_combination || 0)
  } : null;
}

async function findByRef(ref) {
  const obj = await apiGet('/products', {
    'filter[reference]': `[${ref}]`,
    limit: 1,
    display: '[id,ean13,reference,price,id_default_combination]'
  });
  const p = firstOrNull(obj?.prestashop?.products?.product);
  return p ? {
    id: Number(p.id),
    ean13: p.ean13 || null,
    reference: p.reference || null,
    price: Number(p.price),
    id_default_combination: Number(p.id_default_combination || 0)
  } : null;
}

// Sprytne szukanie: najpierw product.reference, potem combination.reference
async function findByRefAny(ref) {
  const p = await findByRef(ref);
  if (p) return { ...p, attrId: 0 };

  const obj = await apiGet('/combinations', {
    'filter[reference]': `[${ref}]`,
    limit: 1,
    display: '[id,id_product,reference]'
  });
  const c = firstOrNull(obj?.prestashop?.combinations?.combination);
  if (!c) return null;

  const attrId = Number(c.id);
  const prod = await readProductSummary(Number(c.id_product));
  if (!prod) return null;
  return { ...prod, attrId };
}

/* ------------------------- UPDATE ceny NETTO ------------------------- */
// Minimalny, stabilny PUT ceny (NETTO: product.price, VAT dolicza Presta)
async function setProductNetPrice(id, newNetPriceEUR) {
  const product = { id: String(id), price: Number(newNetPriceEUR).toFixed(2), id_tax_rules_group: '0' };
  const xml = builder.build({ prestashop: { ...NS_ATTR, product }});
  return apiPut(`/products/${id}`, xml);
}

// Update ceny netto na bazie pełnego GET-a (czyści zbędne pola przed PUT)
async function updateProductPrice(id, newNetPriceEUR) {
  const prod = await getProductLight(id);
  if (!prod) throw new Error(`Brak produktu ${id}`);

  // ustaw nową cenę NETTO
  prod.price = String(Number(newNetPriceEUR).toFixed(2));

  // wyczyść pola, których nie chcemy dotykać przy PUT
  delete prod.manufacturer_name;
  delete prod.position_in_category;
  delete prod.associations;
  delete prod.quantity;

  // zbuduj XML dopiero po czyszczeniu
  const xml = builder.build({ prestashop: { ...NS_ATTR, product: prod }});
  return apiPut(`/products/${id}`, xml);
}

/* ----------------------------- STOCKi ----------------------------- */
async function getStockAvailableId(product_id, product_attribute_id = 0) {
  const obj = await apiGet('/stock_availables', {
    'filter[id_product]': `[${product_id}]`,
    'filter[id_product_attribute]': `[${product_attribute_id}]`,
    limit: 1,
    display: '[id,id_product,id_product_attribute,quantity]'
  });
  const s = firstOrNull(obj?.prestashop?.stock_availables?.stock_available);
  return s ? Number(s.id) : null;
}

async function updateStockQuantity(stock_available_id, quantity) {
  const obj = await apiGet(`/stock_availables/${stock_available_id}`);
  const sa = obj?.prestashop?.stock_available;
  if (!sa) throw new Error(`Brak stock_available ${stock_available_id}`);
  sa.quantity = String(Number(quantity));
  const xml = builder.build({ prestashop: { ...NS_ATTR, stock_available: sa }});
  return apiPut(`/stock_availables/${stock_available_id}`, xml);
}

/* ----------------------------- EXPORT ----------------------------- */
module.exports = {
  // READ/FIND
  findById,
  findByEAN,
  findByRef,
  findByRefAny,
  getProductLight,

  // PRICE
  setProductNetPrice,
  updateProductPrice,

  // STOCK
  getStockAvailableId,
  updateStockQuantity,
};
