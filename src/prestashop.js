// src/prestashop.js
const axios = require('axios');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');

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


// funkcje z retry i exponential backoff
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
    } else {
      console.error(`❌ apiGet failed: ${path}`, err.message);
      throw err;
    }
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
    } else {
      console.error(`❌ apiPut failed: ${path}`, err.message);
      throw err;
    }
  }
}


// Wyszukiwanie produktu
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

async function getProductLight(id) {
  const obj = await apiGet(`/products/${id}`);
  return obj?.prestashop?.product || null;
}

// Update ceny netto (price tax excluded)
async function updateProductPrice(id, newNetPriceEUR) {
  const prod = await getProductLight(id);
  if (!prod) throw new Error(`Brak produktu ${id}`);
  prod.price = String(Number(newNetPriceEUR).toFixed(2)); // netto, bez VAT
  const xml = builder.build({ prestashop: { product: prod }});
  return apiPut(`/products/${id}`, xml);
}

// Stock availables
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
  const xml = builder.build({ prestashop: { stock_available: sa }});
  return apiPut(`/stock_availables/${stock_available_id}`, xml);
}

module.exports = {
  findByEAN,
  findByRef,
  getProductLight,
  updateProductPrice,
  getStockAvailableId,
  updateStockQuantity,
};
