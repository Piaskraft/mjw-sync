// src/test-put.js
require('dotenv').config();

async function updatePriceAndStock() {
  const API_URL = process.env.PS_API_URL;         // np. https://www.piaskraft.com/api
  const API_KEY = process.env.PS_API_KEY;
  const PROD_ID = process.env.PROD_ID || '1359';
  const NEW_NET_PRICE = process.env.NEW_NET_PRICE || '1.99';
  const NEW_STOCK_QTY = process.env.NEW_STOCK_QTY || '7';

  if (!API_URL || !API_KEY) throw new Error('Brak PS_API_URL lub PS_API_KEY w .env');

  const auth = 'Basic ' + Buffer.from(API_KEY + ':').toString('base64');

  // 1) PUT ceny netto (price = NETTO)
  const priceXml = `
  <prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
    <product>
      <id>${PROD_ID}</id>
      <price>${Number(NEW_NET_PRICE).toFixed(2)}</price>
      <id_tax_rules_group>0</id_tax_rules_group>
    </product>
  </prestashop>`.trim();

  console.log(`🔧 Ustawiam cenę NETTO: ${NEW_NET_PRICE} dla produktu ${PROD_ID}`);
  let res = await fetch(`${API_URL}/products/${PROD_ID}`, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/xml' },
    body: priceXml,
  });
  console.log(await res.text());

  // 2) Pobierz stock_available listę i ID
  console.log('🔎 Szukam stock_available...');
  res = await fetch(
    `${API_URL}/stock_availables?display=[id,id_product,id_product_attribute,quantity]&filter[id_product]=[${PROD_ID}]&limit=10`,
    { headers: { Authorization: auth } }
  );
  const listXml = await res.text();
  const saIdMatch = listXml.match(/<id><!\[CDATA\[(\d+)]]><\/id>/);
  if (!saIdMatch) throw new Error('Nie znalazłem stock_available dla tego produktu.');
  const SA_ID = saIdMatch[1];

  // 3) Pobierz pełny rekord stock_available (żeby mieć depends_on_stock / out_of_stock itd.)
  const saGet = await fetch(`${API_URL}/stock_availables/${SA_ID}`, {
    headers: { Authorization: auth }
  });
  const saXml = await saGet.text();

  // Bezpiecznie wyciągamy wartości (z fallbackami)
  const pick = (re, def = '0') => {
    const m = saXml.match(re);
    return m ? m[1] : def;
  };

  const ID_PRODUCT             = pick(/<id_product><!\[CDATA\[(\d+)]]><\/id_product>/, PROD_ID);
  const ID_ATTR                = pick(/<id_product_attribute><!\[CDATA\[(\d*)]]><\/id_product_attribute>/, '0');
  const DEPENDS_ON_STOCK       = pick(/<depends_on_stock><!\[CDATA\[(\d+)]]><\/depends_on_stock>/, '0');
  const OUT_OF_STOCK           = pick(/<out_of_stock><!\[CDATA\[(\d+)]]><\/out_of_stock>/, '2');
  const ID_SHOP                = pick(/<id_shop><!\[CDATA\[(\d+)]]><\/id_shop>/, '1');
  const ID_SHOP_GROUP          = pick(/<id_shop_group><!\[CDATA\[(\d+)]]><\/id_shop_group>/, '0');

  console.log(`📦 stock_available id=${SA_ID} (attr=${ID_ATTR}) depends_on_stock=${DEPENDS_ON_STOCK} out_of_stock=${OUT_OF_STOCK}`);

  // 4) Zbuduj pełny XML – zmieniamy tylko <quantity>
  const stockXml = `
  <prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
    <stock_available>
      <id>${SA_ID}</id>
      <id_product>${ID_PRODUCT}</id_product>
      <id_product_attribute>${ID_ATTR}</id_product_attribute>
      <id_shop_group>${ID_SHOP_GROUP}</id_shop_group>
      <id_shop>${ID_SHOP}</id_shop>
      <depends_on_stock>${DEPENDS_ON_STOCK}</depends_on_stock>
      <out_of_stock>${OUT_OF_STOCK}</out_of_stock>
      <quantity>${Number(NEW_STOCK_QTY)}</quantity>
    </stock_available>
  </prestashop>`.trim();

  console.log(`🔧 Ustawiam ilość: ${NEW_STOCK_QTY}`);
  const putRes = await fetch(`${API_URL}/stock_availables/${SA_ID}`, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/xml' },
    body: stockXml,
  });
  console.log(await putRes.text());

  console.log('✅ test-put: OK');
}

updatePriceAndStock().catch((e) => {
  console.error('❌ test-put error:', e.message || e);
  process.exit(1);
});
