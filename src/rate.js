// src/rate.js
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

async function getRate() {
  const mode = (process.env.RATE_MODE || 'FIXED').toUpperCase();
  if (mode === 'FIXED') {
    const fx = Number(process.env.FX_PLN_EUR);
    if (!fx || fx <= 0) throw new Error('FX_PLN_EUR nieustawiony lub <= 0');
    return fx; // ile PLN kosztuje 1 EUR
  }

  // ECB – dzienny kurs
  const url = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
  const { data } = await axios.get(url, { timeout: 20000, responseType: 'text' });
  const parser = new XMLParser({ ignoreAttributes: false });
  const xml = parser.parse(data);

  // Envelope -> Cube -> Cube(time) -> Cube(currency="PLN", rate="4.3")
  const cubes = xml['gesmes:Envelope']?.Cube?.Cube?.Cube;
  const arr = Array.isArray(cubes) ? cubes : [cubes].filter(Boolean);
  const pln = arr.find(c => c['@_currency'] === 'PLN');
  const rate = Number(pln?.['@_rate']);
  if (!rate) throw new Error('Nie znaleziono kursu PLN w ECB');
  return rate; // ile PLN kosztuje 1 EUR
}

module.exports = { getRate };
