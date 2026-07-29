'use client';

import { useState, useEffect } from 'react';
import { parseFile } from '@/lib/sheets/parse';
import type { SheetInput } from '@/lib/sheets/selectActualSheet';
import { analyzeDeterministic, type AnalysisResult } from '@/lib/pipeline/deterministic';
import { normalize } from '@/lib/engines/classify';
import type { NumberWithSource } from '@/lib/types/contract';
import type { AiResponse, AiItem } from '@/lib/ai/schema';

const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];
const CURRENCIES = ['USD', 'EUR', 'UAH', 'CNY'];
const PROVIDERS = [
  { id: 'claude', label: 'Claude' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'openrouter', label: 'OpenRouter' },
];

const SRC_LABEL: Record<string, string> = {
  user: 'з таблиці', db: 'тариф', kb_coarse: 'груба ставка', ai: 'AI', fallback: 'оцінка', unknown: '—',
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

const fmt = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const box = (est?: boolean): React.CSSProperties => (est ? { color: 'var(--yellow)' } : {});
const statusColor = (s: string) =>
  s === 'red' ? 'var(--red)' : s === 'green' ? 'var(--accent)' : s === 'yellow' ? 'var(--yellow)' : 'var(--ink-2)';

function Cell({ v, suffix }: { v: NumberWithSource | null; suffix?: string }) {
  if (!v) return <span style={{ color: 'var(--ink-2)' }}>—</span>;
  return (
    <span style={box(v.estimated)} title={`джерело: ${SRC_LABEL[v.source] ?? v.source}`}>
      {v.estimated ? '~' : ''}{fmt(v.value)}{suffix ?? ''}
    </span>
  );
}

const label: React.CSSProperties = {
  fontFamily: 'var(--font-geist-mono), monospace', fontSize: 11, color: 'var(--ink-2)',
  textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4,
};
const field: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8,
  color: 'var(--ink)', padding: '8px 10px', fontSize: 14, width: '100%',
};
const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px',
};

export default function Terminal() {
  const [sheets, setSheets] = useState<SheetInput[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [incoterm, setIncoterm] = useState('CIF');
  const [currency, setCurrency] = useState('USD');
  const [freight, setFreight] = useState('');
  const [insurance, setInsurance] = useState('');
  const [fx, setFx] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // BYOK + AI
  const [provider, setProvider] = useState('claude');
  const [apiKey, setApiKey] = useState('');
  const [ai, setAi] = useState<AiResponse | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    const p = localStorage.getItem('lap_ai_provider');
    if (p) setProvider(p);
    const k = localStorage.getItem('lap_ai_key');
    if (k) setApiKey(k);
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(''); setResult(null); setAi(null);
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
    setResult(null); setAi(null); setError('');
  }

  async function runAi(res: AnalysisResult) {
    if (!apiKey.trim()) return;
    setAi(null); setAiError(''); setAiBusy(true);
    try {
      const items = res.lines.map((l) => ({
        name: l.calc.name,
        uctzedCode: l.resolved.code.value,
        dutyRatePercent: l.calc.dutyRatePercent?.value ?? null,
        dutyRateSource: l.resolved.code.source,
        originType: l.resolved.origin?.originType ?? null,
        category: l.resolved.origin?.category ?? '',
        precursorNote: l.resolved.precursor?.note ?? null,
      }));
      const r = await fetch('/api/checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, items }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setAi(data as AiResponse);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  function run() {
    if (!sheets) {
      setError('Спочатку завантажте файл або натисніть «Демо-дані».');
      return;
    }
    setBusy(true); setError(''); setAi(null); setAiError('');
    try {
      const res = analyzeDeterministic(
        sheets,
        {
          incoterm, currency,
          freight: freight ? Number(freight) : null,
          insurance: insurance ? Number(insurance) : null,
          fxToUAH: fx ? Number(fx) : null,
          fxDate: null,
        },
        new Date(),
      );
      setResult(res);
      void runAi(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px 64px', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: 11, letterSpacing: '0.14em', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 999, padding: '3px 10px' }}>
          ● ONLINE · v3
        </span>
        <span style={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: 11, color: 'var(--ink-2)' }}>
          Freight Intelligence Terminal
        </span>
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: '4px 0 20px' }}>
        LOGI-<span style={{ color: 'var(--accent)' }}>ANALYZER</span> PRO
      </h1>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <label style={{ ...field, width: 'auto', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            📄 Завантажити Excel / CSV
            <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={onFile} style={{ display: 'none' }} />
          </label>
          <button onClick={loadDemo} style={{ ...field, width: 'auto', cursor: 'pointer' }}>Демо-дані</button>
          {fileName && <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>{fileName}</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={label}>Incoterm</label>
            <select value={incoterm} onChange={(e) => setIncoterm(e.target.value)} style={field}>
              {INCOTERMS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Валюта</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={field}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label style={label}>Фрахт</label><input value={freight} onChange={(e) => setFreight(e.target.value)} placeholder="0" style={field} inputMode="decimal" /></div>
          <div><label style={label}>Страхування</label><input value={insurance} onChange={(e) => setInsurance(e.target.value)} placeholder="0" style={field} inputMode="decimal" /></div>
          <div><label style={label}>Курс → UAH</label><input value={fx} onChange={(e) => setFx(e.target.value)} placeholder="напр. 42" style={field} inputMode="decimal" /></div>
        </div>

        {/* BYOK */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,180px) 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={label}>AI-провайдер</label>
            <select
              value={provider}
              onChange={(e) => { setProvider(e.target.value); localStorage.setItem('lap_ai_provider', e.target.value); }}
              style={field}
            >
              {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>API-ключ (BYOK) — для перевірок ЄС/UA, зберігається лише у браузері</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); localStorage.setItem('lap_ai_key', e.target.value); }}
              placeholder="sk-... (необов'язково; без ключа працює лише розрахунок)"
              style={field}
              autoComplete="off"
            />
          </div>
        </div>

        <button onClick={run} disabled={busy} style={{ background: 'var(--accent)', color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '11px 22px', fontWeight: 700, fontSize: 15, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Аналіз…' : 'Запустити аналіз ▶'}
        </button>
      </div>

      {error && <div style={{ ...card, borderColor: 'var(--red)', color: 'var(--red)', marginBottom: 16 }}>{error}</div>}

      {result && (
        <Results r={result} currency={currency} ai={ai} aiBusy={aiBusy} aiError={aiError} hasKey={!!apiKey.trim()} />
      )}
    </div>
  );
}

function CheckList({ checks }: { checks: { item: string; status: string; note: string }[] }) {
  if (!checks?.length) return <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>—</span>;
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {checks.map((c, i) => (
        <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.4 }}>
          <span style={{ color: statusColor(c.status), flex: '0 0 auto' }}>●</span>
          <span>
            <b>{c.item}</b>
            {c.note ? <span style={{ color: 'var(--ink-2)' }}> — {c.note}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Results({
  r, currency, ai, aiBusy, aiError, hasKey,
}: {
  r: AnalysisResult; currency: string; ai: AiResponse | null; aiBusy: boolean; aiError: string; hasKey: boolean;
}) {
  const s = r.calc.summary;
  const metrics = [
    { k: 'Митна вартість', v: s.totalCustomsValue },
    { k: 'Мито', v: s.totalDuty },
    { k: 'ПДВ', v: s.totalVAT },
    { k: 'До сплати', v: s.totalPayable },
  ];
  const aiByName = new Map<string, AiItem>();
  if (ai) for (const it of ai.items) aiByName.set(normalize(it.name), it);

  return (
    <div>
      <div style={{ background: 'var(--surface-2)', borderLeft: '3px solid var(--accent)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 14 }}>
        <span style={{ fontFamily: 'var(--font-geist-mono), monospace', color: 'var(--accent)' }}>
          ▶ ЛИСТ «{r.selectedSheetName}»{r.selectedSheetDate ? ` · ${r.selectedSheetDate}` : ''}
        </span>
        <div style={{ color: 'var(--ink-2)', marginTop: 4 }}>{r.reason}. Проігноровано: {r.ignored.length}.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        {metrics.map((m) => (
          <div key={m.k} style={card}>
            <div style={label}>{m.k}</div>
            <div style={{ fontSize: 22, fontWeight: 700, ...box(m.v.estimated) }}>
              {m.v.estimated ? '~' : ''}{fmt(m.v.value)} <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{currency}</span>
            </div>
          </div>
        ))}
      </div>

      {/* AI status / critical alert / NCTS */}
      {hasKey && aiBusy && (
        <div style={{ ...card, marginBottom: 16, color: 'var(--ink-2)' }}>🤖 AI аналізує перевірки ЄС/UA…</div>
      )}
      {aiError && (
        <div style={{ ...card, marginBottom: 16, borderColor: 'var(--red)', color: 'var(--red)' }}>AI: {aiError}</div>
      )}
      {ai?.criticalAlert && (
        <div style={{ ...card, marginBottom: 16, borderColor: 'var(--red)' }}>
          <div style={{ ...label, color: 'var(--red)' }}>Критичний фактор</div>
          <div style={{ fontSize: 14 }}>{ai.criticalAlert}</div>
        </div>
      )}
      {ai?.nctsList?.length ? (
        <div style={{ ...card, marginBottom: 16, borderColor: 'var(--accent)' }}>
          <div style={{ ...label, color: 'var(--accent)' }}>NCTS · чекліст</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
            {ai.nctsList.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      ) : null}

      {/* Table */}
      <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 16 }}>
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
                        <span key={k} style={{ fontSize: 11, color: f.c, border: `1px solid ${f.c}`, borderRadius: 6, padding: '1px 6px', whiteSpace: 'nowrap' }}>{f.t}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* AI checks per item */}
      {ai && (
        <div>
          <div style={{ ...label, color: 'var(--accent)', fontSize: 12, marginBottom: 10 }}>
            Перевірки для брокера (AI) — ЄС та Україна
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {r.lines.map((l, i) => {
              const it = aiByName.get(normalize(l.calc.name));
              if (!it) return null;
              return (
                <div key={i} style={card}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                    <b>{l.calc.name}</b>
                    {it.risk && (
                      <span style={{ fontSize: 11, color: it.risk === 'Критичний' ? 'var(--red)' : it.risk === 'Середній' ? 'var(--yellow)' : 'var(--accent)', border: '1px solid currentColor', borderRadius: 6, padding: '1px 8px' }}>
                        ризик: {it.risk}
                      </span>
                    )}
                    {it.originShortNote && <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>{it.originShortNote}</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                    <div>
                      <div style={{ ...label, color: 'var(--ink)' }}>🇪🇺 Транзит ЄС</div>
                      <CheckList checks={it.euChecks} />
                    </div>
                    <div>
                      <div style={{ ...label, color: 'var(--ink)' }}>🇺🇦 Розмитнення UA</div>
                      <CheckList checks={it.uaChecks} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {r.warnings.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ ...label, color: 'var(--yellow)' }}>Застереження ({r.warnings.length})</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.6 }}>
            {r.warnings.slice(0, 12).map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <p style={{ color: 'var(--ink-2)', fontSize: 12, marginTop: 16, lineHeight: 1.5 }}>
        «~» — оцінка (фрахт ×1.10 або груба ставка глави). Ставки мита у Фазі 1 — з мігрованої таблиці, звіряйте з офіційним тарифом.
        AI-перевірки ґрунтуються на переданих кодах/ставках і не рахують гроші.
      </p>
    </div>
  );
}
