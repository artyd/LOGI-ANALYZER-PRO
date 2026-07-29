// Витягує довідники (KB) зі старого index.html і зберігає у lib/data/*.json.
// Запуск: node scripts/extract-kb.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.resolve(ROOT, '..', 'index.html'); // старий застосунок
const OUT = path.resolve(ROOT, 'lib', 'data');

const html = fs.readFileSync(SRC, 'utf8');

/**
 * Балансований екстрактор: від `const NAME =` знаходить перший [ або {
 * і сканує до відповідного закриваючого, поважаючи рядки, коментарі й regex.
 */
function extractLiteral(source, constName) {
  const marker = `const ${constName} =`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Не знайдено: ${constName}`);
  let i = source.indexOf('[', start);
  let j = source.indexOf('{', start);
  // Обираємо перший відкриваючий (масив чи об'єкт)
  let open = i < 0 ? j : j < 0 ? i : Math.min(i, j);
  const openCh = source[open];
  const closeCh = openCh === '[' ? ']' : '}';

  let depth = 0;
  let inStr = null; // ' " `
  let inLine = false;
  let inBlock = false;
  let inRegex = false;
  let inClass = false; // всередині [...] у regex
  let prevSig = ''; // попередній значущий символ (для детекції regex)

  for (let k = open; k < source.length; k++) {
    const c = source[k];
    const n = source[k + 1];

    if (inLine) {
      if (c === '\n') inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === '*' && n === '/') { inBlock = false; k++; }
      continue;
    }
    if (inStr) {
      if (c === '\\') { k++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (inRegex) {
      if (c === '\\') { k++; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) inRegex = false;
      continue;
    }

    // не в рядку/коментарі/regex
    if (c === '/' && n === '/') { inLine = true; k++; continue; }
    if (c === '/' && n === '*') { inBlock = true; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; prevSig = c; continue; }
    if (c === '/') {
      // regex, якщо попередній значущий символ дозволяє початок виразу
      if (/[=(,:[!&|?{;]/.test(prevSig) || prevSig === '') { inRegex = true; continue; }
    }

    if (c === openCh) depth++;
    else if (c === closeCh) {
      depth--;
      if (depth === 0) {
        return source.slice(open, k + 1);
      }
    }
    if (!/\s/.test(c)) prevSig = c;
  }
  throw new Error(`Не збалансовано: ${constName}`);
}

// RegExp → {__regex, source, flags} для JSON
function regexReplacer(_key, value) {
  return value;
}
function serialize(obj) {
  return JSON.stringify(
    obj,
    (k, v) => v,
    2,
  );
}
// Глибокий обхід для конвертації RegExp (Function-eval повертає справжні RegExp)
function convertRegex(x) {
  if (x instanceof RegExp) return { __regex: true, source: x.source, flags: x.flags };
  if (Array.isArray(x)) return x.map(convertRegex);
  if (x && typeof x === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(x)) o[k] = convertRegex(v);
    return o;
  }
  return x;
}

const targets = [
  'PRODUCT_ORIGIN_KB',
  'MANUFACTURER_KB',
  'ADR_SUBSTANCE_DB',
  'UKTZED_CODE_DB',
  'HS_DUTY_TABLE',
  'PRECURSOR_WATCH',
];

fs.mkdirSync(OUT, { recursive: true });

const summary = [];
for (const name of targets) {
  const text = extractLiteral(html, name);
  // eslint-disable-next-line no-new-func
  const value = new Function(`return (${text});`)();
  const converted = convertRegex(value);
  const file = path.join(OUT, `${name.toLowerCase()}.json`);
  fs.writeFileSync(file, serialize(converted), 'utf8');
  const count = Array.isArray(converted) ? converted.length : Object.keys(converted).length;
  summary.push(`${name}: ${count} → ${path.relative(ROOT, file)}`);
}

console.log('Витягнуто:\n' + summary.join('\n'));
