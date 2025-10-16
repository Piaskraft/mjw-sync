// scripts/put-price.js
require('dotenv').config();
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const PROD_ID = process.env.PROD_ID || '1359';
const API_URL = `${process.env.PS_API_URL}/products/${PROD_ID}`;
const API_KEY = process.env.PS_API_KEY;
const NEW_NET_PRICE = process.env.NEW_NET_PRICE || '1.99'; // netto EUR

(async () => {
  const xml = `
  <prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
    <product>
      <id>${PROD_ID}</id>
      <price>${Number(NEW_NET_PRICE).toFixed(2)}</price>
      <id_tax_rules_group>0</id_tax_rules_group>
    </product>
  </prestashop>`;

  const res = await fetch(API_URL, {
    method: 'PUT',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(API_KEY + ':').toString('base64'),
      'Content-Type': 'application/xml',
    },
    body: xml,
  });

  const text = await res.text();
  console.log(text);
})();
