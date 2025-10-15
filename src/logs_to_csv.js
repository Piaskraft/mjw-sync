// src/logs_to_csv.js
const fs = require('fs');
const path = require('path');

function jsonlToCsv(inputFile, outputFile) {
  const data = fs.readFileSync(inputFile, 'utf8').trim().split('\n').map(JSON.parse);
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(';'),
    ...data.map(row => headers.map(h => (row[h] ?? '')).join(';'))
  ].join('\n');
  fs.writeFileSync(outputFile, csv, 'utf8');
  console.log(`✅ CSV zapisany: ${outputFile}`);
}

function main() {
  const logsDir = path.join(process.cwd(), 'logs');
  const files = fs.readdirSync(logsDir)
    .filter(f => f.endsWith('.jsonl'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log('❌ Brak plików logów w folderze logs/');
    return;
  }

  const latest = path.join(logsDir, files[0]);
  const outFile = latest.replace('.jsonl', '.csv');
  jsonlToCsv(latest, outFile);
}

main();
