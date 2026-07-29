// Будує з harmonized-system.csv (UN Comtrade) компактні дані:
//  - lib/data/hs_valid6.json : масив валідних 6-значних підпозицій HS (валідація коду)
//  - lib/data/hs_desc.json   : { hscode: description } для глав/позицій/підпозицій (2/4/6)
// Джерело CSV: https://github.com/datasets/harmonized-system  (data/harmonized-system.csv)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = process.argv[2] || path.resolve(ROOT, 'scripts', 'hs.csv');
const OUT = path.resolve(ROOT, 'lib', 'data');

function parseLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const text = fs.readFileSync(SRC, 'utf8').replace(/\r\n?/g, '\n');
const lines = text.split('\n').filter(Boolean);
lines.shift(); // header

const desc = {};
const valid6 = [];
for (const line of lines) {
  const [, hscode, description, , level] = parseLine(line);
  if (!hscode) continue;
  const code = hscode.trim();
  desc[code] = (description || '').trim();
  if (String(level).trim() === '6' && /^\d{6}$/.test(code)) valid6.push(code);
}

fs.writeFileSync(path.join(OUT, 'hs_valid6.json'), JSON.stringify(valid6), 'utf8');
fs.writeFileSync(path.join(OUT, 'hs_desc.json'), JSON.stringify(desc), 'utf8');
console.log(`hs_valid6: ${valid6.length} кодів (${(fs.statSync(path.join(OUT, 'hs_valid6.json')).size / 1024).toFixed(0)} КБ)`);
console.log(`hs_desc:   ${Object.keys(desc).length} описів (${(fs.statSync(path.join(OUT, 'hs_desc.json')).size / 1024).toFixed(0)} КБ)`);
