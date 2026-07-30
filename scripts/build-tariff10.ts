/**
 * Наповнює вбудований статутний тариф `lib/data/ua_tariff10.json` з офіційного
 * файла Митного тарифу України (Закон №2697-IX) — XLSX або CSV.
 *
 * ВИКОРИСТАННЯ:
 *   npm run build-tariff10 -- "C:/шлях/до/mytnyi-taryf-2697.xlsx"
 *
 * Очікувані колонки (автовизначення, як у lib/tariff/tariff.ts):
 *   код УКТЗЕД (10 знаків) | ставка ввізного мита, % | [ПДВ, %] | [опис]
 * «Безмитно/вільна/free/-» → 0%. Ставка стає авторитетною (source 'db') на
 * 10-значному рівні; ПДВ 7% для ліків підхоплюється, якщо колонка ПДВ є.
 *
 * ДЖЕРЕЛО ДАНИХ (перевірено 2026-07 — відкритого bulk-джерела немає):
 *   - zakon.rada — anti-bot; data.gov.ua — лише вивізне мито; WITS — лише HS-6.
 *   Реальний файл: вивантаження QDPro/1С або офіційний XLSX тарифу.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import { parseTariffRows } from '../lib/tariff/tariff';

const src = process.argv[2];
if (!src) {
  console.error('Вкажіть шлях до файла тарифу: npm run build-tariff10 -- <file.xlsx|csv>');
  process.exit(1);
}

const wb = XLSX.read(readFileSync(src), { type: 'buffer' });
// Беремо найбільший аркуш (тариф — найдовша таблиця).
let bestRows: (string | number | null | undefined)[][] = [];
for (const name of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false }) as (string | number | null | undefined)[][];
  if (rows.length > bestRows.length) bestRows = rows;
}

const entries = parseTariffRows(bestRows).filter((e) => e.code.length >= 6);
if (entries.length === 0) {
  console.error('Не знайдено жодного рядка з кодом+ставкою. Перевір формат файла (колонки код/мито).');
  process.exit(2);
}

const out = resolve(process.cwd(), 'lib/data/ua_tariff10.json');
writeFileSync(out, JSON.stringify(entries, null, 0) + '\n', 'utf8');
const tenDigit = entries.filter((e) => e.code.length === 10).length;
console.log(`✓ Записано ${entries.length} позицій (${tenDigit} з них 10-значні) → ${out}`);
