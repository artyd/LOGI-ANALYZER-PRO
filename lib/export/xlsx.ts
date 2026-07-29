import type { AnalysisResult } from '../pipeline/deterministic';
import type { AiResponse } from '../ai/schema';

/** Генерує та завантажує XLSX-звіт (клієнтський, SheetJS). */
export async function exportReport(r: AnalysisResult, currency: string, ai: AiResponse | null) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const s = r.calc.summary;

  const summary: (string | number)[][] = [
    ['LOGI-ANALYZER PRO — звіт'],
    ['Лист', r.selectedSheetName],
    ['Дата листа', r.selectedSheetDate ?? '—'],
    ['Причина вибору', r.reason],
    ['Валюта', currency],
    [],
    ['Митна вартість', s.totalCustomsValue.value],
    ['Мито', s.totalDuty.value],
    ['ПДВ', s.totalVAT.value],
    ['До сплати', s.totalPayable.value],
    ['Є оцінки (~)', s.anyEstimated ? 'так' : 'ні'],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1['!cols'] = [{ wch: 22 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Зведена');

  const head = ['Товар', 'УКТЗЕД', 'К-сть, кг', 'Ціна', 'Митна варт.', 'Ставка %', 'Мито', 'ПДВ', 'Разом', 'Оцінка', 'Прекурсор', 'ADR', 'Походження'];
  const rows = r.lines.map((l) => [
    l.calc.name,
    l.resolved.code.value ?? '',
    l.calc.qtyKg,
    +(l.calc.goodsValue.value / (l.calc.qtyKg || 1)).toFixed(2),
    l.calc.customsValue.value,
    l.calc.dutyRatePercent?.value ?? '',
    l.calc.duty?.value ?? '',
    l.calc.vat?.value ?? '',
    l.calc.totalPayable?.value ?? '',
    l.calc.customsValue.estimated ? 'так' : '',
    l.resolved.precursor ? `Табл.${l.resolved.precursor.table}` : '',
    l.resolved.adr?.class ?? '',
    l.resolved.origin?.originType ?? '',
  ]);
  const ws2 = XLSX.utils.aoa_to_sheet([head, ...rows]);
  ws2['!cols'] = head.map((h) => ({ wch: Math.max(10, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws2, 'Детальний');

  if (ai) {
    const eu: string[][] = [['Товар', 'Перевірка', 'Статус', 'Коментар']];
    const ua: string[][] = [['Товар', 'Перевірка', 'Статус', 'Коментар']];
    for (const it of ai.items) {
      for (const c of it.euChecks) eu.push([it.name, c.item, c.status, c.note]);
      for (const c of it.uaChecks) ua.push([it.name, c.item, c.status, c.note]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(eu), 'Перевірки ЄС');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ua), 'Розмитнення UA');
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `LOGI-ANALYZER_${d}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
