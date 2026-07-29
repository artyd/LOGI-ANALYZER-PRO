'use client';

import { useState } from 'react';
import { parseFile } from '@/lib/sheets/parse';
import type { SheetInput } from '@/lib/sheets/selectActualSheet';
import { analyzeDeterministic, type AnalysisResult } from '@/lib/pipeline/deterministic';
import type { NumberWithSource } from '@/lib/types/contract';

const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];
const CURRENCIES = ['USD', 'EUR', 'UAH', 'CNY'];

const SRC_LABEL: Record<string, string> = {
  user: 'з таблиці',
  db: 'тариф',
  kb_coarse: 'груба ставка',
  ai: 'AI',
  fallback: 'оцінка',
  unknown: '—',
};

const DEMO: SheetInput[] = [
  {
    name: '06.05',
    rows: [
      ['Номенклатура', 'Кількість, кг', 'Ціна, USD/кг', 'УКТЗЕД'],
      ['L-Лізин сульфат 70%', '2000', '1.8', ''],
      ['Амоксицилін тригідрат', '500', '32', ''],
      ['Гіалуронова кислота', '25', '210', '3913 90 00 90'],
      ['DL-Метіонін кормовий', '1000', '2.4', ''],
      ['Ephedrine HCl', '50', '120', ''],
      ['Загадковий товар XYZ', '100', '5', ''],
    ],
  },
];

const fmt = (n: number) =>
  n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function box(estimated?: boolean): React.CSSProperties {
  return estimated ? { color: 'var(--yellow)' } : {};
}

function Cell({ v, suffix }: { v: NumberWithSource | null; suffix?: string }) {
  if (!v) return <span style={{ color: 'var(--ink-2)' }}>—</span>;
  return (
    <span style={box(v.estimated)} title={`джерело: ${SRC_LABEL[v.source] ?? v.source}`}>
      {v.estimated ? '~' : ''}
      {fmt(v.value)}
      {suffix ?? ''}
    </span>
  );
}

const label: React.CSSProperties = {
  fontFamily: 'var(--font-geist-mono), monospace',
  fontSize: 11,
  color: 'var(--ink-2)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  display: 'block',
  marginBottom: 4,
};
const field: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  color: 'var(--ink)',
  padding: '8px 10px',
  fontSize: 14,
  width: '100%',
};
const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  padding: '16px 18px',
};

export default function Terminal() {
  const [sheets, setSheets] = useState<SheetInput[] | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [incoterm, setIncoterm] = useState('CIF');
  const [currency, setCurrency] = useState('USD');
  const [freight, setFreight] = useState('');
  const [insurance, setInsurance] = useState('');
  const [fx, setFx] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError('');
    setResult(null);
    try {
      const parsed = await parseFile(f);
      setSheets(parsed);
      setFileName(`${f.name} · ${parsed.length} лист(ів)`);
    } catch (err) {
      setError(`Не вдалося прочитати файл: ${(err as Error).message}`);
    }
  }

  function loadDemo() {
    setSheets(DEMO);
    setFileName('Демо-дані · 1 лист');
    setResult(null);
    setError('');
  }

  function run() {
    if (!sheets) {
      setError('Спочатку завантажте файл або натисніть «Демо».');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = analyzeDeterministic(
        sheets,
        {
          incoterm,
          currency,
          freight: freight ? Number(freight) : null,
          insurance: insurance ? Number(insurance) : null,
          fxToUAH: fx ? Number(fx) : null,
          fxDate: null,
        },
        new Date(),
      );
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px 64px', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: 'var(--font-geist-mono), monospace',
            fontSize: 11,
            letterSpacing: '0.14em',
            color: 'var(--accent)',
            border: '1px solid var(--accent)',
            borderRadius: 999,
            padding: '3px 10px',
          }}
        >
          ● ONLINE · v3
        </span>
        <span style={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: 11, color: 'var(--ink-2)' }}>
          Freight Intelligence Terminal
        </span>
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: '4px 0 20px' }}>
        LOGI-<span style={{ color: 'var(--accent)' }}>ANALYZER</span> PRO
      </h1>

      {/* Command deck */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <label
            style={{
              ...field,
              width: 'auto',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            📄 Завантажити Excel / CSV
            <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={onFile} style={{ display: 'none' }} />
          </label>
          <button onClick={loadDemo} style={{ ...field, width: 'auto', cursor: 'pointer' }}>
            Демо-дані
          </button>
          {fileName && <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>{fileName}</span>}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <label style={label}>Incoterm</label>
            <select value={incoterm} onChange={(e) => setIncoterm(e.target.value)} style={field}>
              {INCOTERMS.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={label}>Валюта</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={field}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={label}>Фрахт</label>
            <input value={freight} onChange={(e) => setFreight(e.target.value)} placeholder="0" style={field} inputMode="decimal" />
          </div>
          <div>
            <label style={label}>Страхування</label>
            <input value={insurance} onChange={(e) => setInsurance(e.target.value)} placeholder="0" style={field} inputMode="decimal" />
          </div>
          <div>
            <label style={label}>Курс → UAH</label>
            <input value={fx} onChange={(e) => setFx(e.target.value)} placeholder="напр. 42" style={field} inputMode="decimal" />
          </div>
        </div>

        <button
          onClick={run}
          disabled={busy}
          style={{
            background: 'var(--accent)',
            color: 'var(--bg)',
            border: 'none',
            borderRadius: 8,
            padding: '11px 22px',
            fontWeight: 700,
            fontSize: 15,
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Аналіз…' : 'Запустити аналіз ▶'}
        </button>
      </div>

      {error && (
        <div style={{ ...card, borderColor: 'var(--red)', color: 'var(--red)', marginBottom: 16 }}>{error}</div>
      )}

      {result && <Results r={result} currency={currency} />}
    </div>
  );
}

function Results({ r, currency }: { r: AnalysisResult; currency: string }) {
  const s = r.calc.summary;
  const metrics = [
    { k: 'Митна вартість', v: s.totalCustomsValue },
    { k: 'Мито', v: s.totalDuty },
    { k: 'ПДВ', v: s.totalVAT },
    { k: 'До сплати', v: s.totalPayable },
  ];
  return (
    <div>
      {/* Sheet banner */}
      <div
        style={{
          background: 'var(--surface-2)',
          borderLeft: '3px solid var(--accent)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          fontSize: 14,
        }}
      >
        <span style={{ fontFamily: 'var(--font-geist-mono), monospace', color: 'var(--accent)' }}>
          ▶ ЛИСТ «{r.selectedSheetName}»{r.selectedSheetDate ? ` · ${r.selectedSheetDate}` : ''}
        </span>
        <div style={{ color: 'var(--ink-2)', marginTop: 4 }}>
          {r.reason}. Проігноровано: {r.ignored.length}.
        </div>
      </div>

      {/* Metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        {metrics.map((m) => (
          <div key={m.k} style={card}>
            <div style={label}>{m.k}</div>
            <div style={{ fontSize: 22, fontWeight: 700, ...box(m.v.estimated) }}>
              {m.v.estimated ? '~' : ''}
              {fmt(m.v.value)} <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{currency}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, minWidth: 900 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--ink-2)' }}>
              {['Товар', 'УКТЗЕД', 'К-сть, кг', 'Ціна', 'Митна варт.', 'Ставка', 'Мито', 'ПДВ', 'Разом', 'Прапорці'].map((h) => (
                <th key={h} style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.lines.map((l, i) => {
              const flags: { t: string; c: string }[] = [];
              if (l.resolved.precursor) flags.push({ t: `Прекурсор Т${l.resolved.precursor.table}`, c: 'var(--red)' });
              if (l.resolved.adr) flags.push({ t: `ADR ${l.resolved.adr.class}`, c: 'var(--yellow)' });
              if (l.resolved.origin) flags.push({ t: l.resolved.origin.originType, c: 'var(--ink-2)' });
              if (l.calc.needsReview) flags.push({ t: 'перевірити', c: 'var(--yellow)' });
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '10px 12px', minWidth: 200 }}>{l.calc.name}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-geist-mono), monospace', whiteSpace: 'nowrap' }}>
                    {l.resolved.code.value ?? <span style={{ color: 'var(--ink-2)' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 12px' }}>{fmt(l.calc.qtyKg)}</td>
                  <td style={{ padding: '10px 12px' }}>{fmt(l.calc.goodsValue.value / (l.calc.qtyKg || 1))}</td>
                  <td style={{ padding: '10px 12px' }}><Cell v={l.calc.customsValue} /></td>
                  <td style={{ padding: '10px 12px' }}><Cell v={l.calc.dutyRatePercent} suffix="%" /></td>
                  <td style={{ padding: '10px 12px' }}><Cell v={l.calc.duty} /></td>
                  <td style={{ padding: '10px 12px' }}><Cell v={l.calc.vat} /></td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}><Cell v={l.calc.totalPayable} /></td>
                  <td style={{ padding: '10px 12px', minWidth: 160 }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {flags.map((f, k) => (
                        <span
                          key={k}
                          style={{
                            fontSize: 11,
                            color: f.c,
                            border: `1px solid ${f.c}`,
                            borderRadius: 6,
                            padding: '1px 6px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {f.t}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Warnings */}
      {r.warnings.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ ...label, color: 'var(--yellow)' }}>Застереження ({r.warnings.length})</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.6 }}>
            {r.warnings.slice(0, 12).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <p style={{ color: 'var(--ink-2)', fontSize: 12, marginTop: 16, lineHeight: 1.5 }}>
        Значення з «~» — оцінка (напр. фрахт ×1.10 або груба ставка глави). Ставки мита у Фазі 1 беруться з
        мігрованої таблиці й потребують звірки з офіційним тарифом. AI-перевірки ЄС/UA додаються окремо.
      </p>
    </div>
  );
}
