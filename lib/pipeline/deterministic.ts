import { selectActualSheet, type SheetInput } from '../sheets/selectActualSheet';
import { extractRows, type ColumnMap } from '../sheets/parse';
import { resolveLine, type ResolvedLine } from '../engines/resolve';
import { calculatePayments } from '../engines/payment';
import {
  ShipmentCostInput,
  type CalcResponse,
  type CalcLineResult,
} from '../types/contract';

/**
 * Детермінований аналіз без AI та без БД — усе працює в браузері на
 * чистих рушіях + вбудованих довідниках. AI (euChecks/uaChecks) додається окремо.
 */
export interface AnalysisLine {
  resolved: ResolvedLine;
  calc: CalcLineResult;
}

export interface AnalysisResult {
  selectedSheetName: string;
  selectedSheetDate: string | null;
  reason: string;
  ignored: string[];
  columns: ColumnMap;
  lines: AnalysisLine[];
  calc: CalcResponse;
  warnings: string[];
}

export function analyzeDeterministic(
  sheets: SheetInput[],
  shipmentInput: unknown,
  currentDate: Date,
): AnalysisResult {
  const shipment = ShipmentCostInput.parse(shipmentInput);

  const { selected, reason, ignored } = selectActualSheet(sheets, currentDate);
  if (!selected) {
    throw new Error(
      'Не знайдено листів із товарною таблицею (потрібна колонка назви + числові колонки).',
    );
  }

  const { rows, columns } = extractRows(selected);
  if (rows.length === 0) {
    throw new Error(
      `Лист "${selected.name}" не містить товарних рядків (перевірте, що є колонка з назвою товару).`,
    );
  }

  const resolved = rows.map(resolveLine);
  const calc = calculatePayments({
    shipment,
    lines: resolved.map((r) => r.calcInput),
  });

  const lines: AnalysisLine[] = resolved.map((r, i) => ({ resolved: r, calc: calc.lines[i] }));

  const warnings = Array.from(
    new Set(lines.flatMap((l) => [...l.resolved.warnings, ...l.calc.warnings])),
  );

  return {
    selectedSheetName: selected.name,
    selectedSheetDate: selected.parsedDate
      ? selected.parsedDate.toLocaleDateString('uk-UA')
      : null,
    reason,
    ignored,
    columns,
    lines,
    calc,
    warnings,
  };
}
