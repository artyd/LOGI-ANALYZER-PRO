// Витягує zedTopics (база знань) з оригінального index.html у lib/data/zed_topics.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = 'C:/Users/a.svystelnyk/Downloads/Файлі/index.html';
const html = fs.readFileSync(SRC, 'utf8');

function extractLiteral(source, constName) {
  const start = source.indexOf(`const ${constName} =`);
  if (start < 0) throw new Error(`not found: ${constName}`);
  const open = source.indexOf('[', start);
  let depth = 0, inStr = null, inLine = false, inBlock = false, prev = '';
  for (let k = open; k < source.length; k++) {
    const c = source[k], n = source[k + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; k++; } continue; }
    if (inStr) { if (c === '\\') { k++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '/' && n === '/') { inLine = true; k++; continue; }
    if (c === '/' && n === '*') { inBlock = true; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) return source.slice(open, k + 1); }
    if (!/\s/.test(c)) prev = c;
  }
  throw new Error('unbalanced');
}

const text = extractLiteral(html, 'zedTopics');
// eslint-disable-next-line no-new-func
const value = new Function(`return (${text});`)();
const out = path.resolve(ROOT, 'lib', 'data', 'zed_topics.json');
fs.writeFileSync(out, JSON.stringify(value, null, 2), 'utf8');
console.log(`zedTopics: ${value.length} тем → ${path.relative(ROOT, out)}`);
