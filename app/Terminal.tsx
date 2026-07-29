'use client';

import { useState, useEffect } from 'react';
import { parseFile } from '@/lib/sheets/parse';
import type { SheetInput } from '@/lib/sheets/selectActualSheet';
import { analyzeDeterministic, type AnalysisResult } from '@/lib/pipeline/deterministic';
import { normalize } from '@/lib/engines/classify';
import type { NumberWithSource } from '@/lib/types/contract';
import type { AiResponse, AiItem } from '@/lib/ai/schema';
import { exportReport } from '@/lib/export/xlsx';
import { loadArchive, saveToArchive, clearArchive, type ArchiveEntry } from '@/lib/archive';

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
const pillClass = (s: string) =>
  s === 'red' ? 'pill pill-red' : s === 'green' ? 'pill pill-green' : s === 'yellow' ? 'pill pill-yellow' : 'pill pill-muted';

function Cell({ v, suffix }: { v: NumberWithSource | null; suffix?: string }) {
  if (!v) return <span style={{ color: 'var(--ink-3)' }}>—</span>;
  return (
    <span className={v.estimated ? 'est mono' : 'mono'} title={`джерело: ${SRC_LABEL[v.source] ?? v.source}`}>
      {v.estimated ? '~' : ''}{fmt(v.value)}{suffix ?? ''}
    </span>
  );
}

export default function Terminal() {
  const [sheets, setSheets] = useState<SheetInput[] | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [incoterm, setIncoterm] = useState('CIF');
  const [currency, setCurrency] = useState('USD');
  const [freight, setFreight] = useState('');
  const [insurance, setInsurance] = useState('');
  const [fx, setFx] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [provider, setProvider] = useState('claude');
  const [apiKey, setApiKey] = useState('');
  const [ai, setAi] = useState<AiResponse | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

  const [archive, setArchive] = useState<ArchiveEntry[]>([]);
  const [showArchive, setShowArchive] = useState(false);

  useEffect(() => {
    const p = localStorage.getItem('lap_ai_provider');
    if (p) setProvider(p);
    const k = localStorage.getItem('lap_ai_key');
    if (k) setApiKey(k);
    setArchive(loadArchive());
  }, []);

  function persist(res: AnalysisResult, aiRes: AiResponse | null) {
    const entry: ArchiveEntry = {
      ts: Date.now(),
      when: new Date().toLocaleString('uk-UA'),
      name: `${sourceLabel || res.selectedSheetName} · ${res.selectedSheetName}`,
      count: res.lines.length,
      total: res.calc.summary.totalPayable.value,
      currency,
      result: res,
      ai: aiRes,
    };
    setArchive(saveToArchive(entry));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(''); setResult(null); setAi(null);
    try {
      const parsed = await parseFile(f);
      setSheets(parsed);
      setSourceLabel(`📄 ${f.name}`);
    } catch (err) {
      setError(`Не вдалося прочитати файл: ${(err as Error).message}`);
    }
  }

  async function loadSheetUrl() {
    if (!sheetUrl.trim()) return;
    setError(''); setResult(null); setAi(null); setBusy(true);
    try {
      const r = await fetch('/api/sheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sheetUrl.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setSheets(data.sheets as SheetInput[]);
      setSourceLabel('🔗 Google Sheets');
    } catch (err) {
      setError(`Google Sheets: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function loadDemo() {
    setSheets(DEMO); setSourceLabel('Демо-дані'); setResult(null); setAi(null); setError('');
  }

  async function runAi(res: AnalysisResult) {
    if (!apiKey.trim()) { persist(res, null); return; }
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, items }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setAi(data as AiResponse);
      persist(res, data as AiResponse);
    } catch (e) {
      setAiError((e as Error).message);
      persist(res, null);
    } finally {
      setAiBusy(false);
    }
  }

  function run() {
    if (!sheets) { setError('Спочатку завантажте файл, вставте посилання Google Sheets або натисніть «Демо-дані».'); return; }
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

  function openEntry(e: ArchiveEntry) {
    setResult(e.result); setAi(e.ai); setCurrency(e.currency);
    setShowArchive(false); setError(''); setAiError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: '26px 20px 64px', width: '100%' }}>
      {/* Command deck */}
      <div className="deck">
        <div className="deck-head">
          Command Deck · джерело даних
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ink-4)' }}>КЛІЄНТ · БЕЗ СЕРВЕРА ДЛЯ РОЗРАХУНКУ</span>
        </div>
        <div className="deck-body">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <label className="btn" style={{ cursor: 'pointer' }}>
              📄 Excel / CSV
              <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={onFile} style={{ display: 'none' }} />
            </label>
            <button className="btn" onClick={loadDemo}>Демо-дані</button>
            <button className="btn" onClick={() => setShowArchive((v) => !v)}>🗂 Архів ({archive.length})</button>
            {sourceLabel && <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>{sourceLabel}</span>}
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
            <input
              className="field"
              style={{ flex: 1, minWidth: 240 }}
              placeholder="або встав посилання Google Sheets (доступ «Усі з посиланням»)"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
            />
            <button className="btn" onClick={loadSheetUrl} disabled={busy}>Завантажити ↧</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <label className="lbl">Incoterm</label>
              <select className="field" value={incoterm} onChange={(e) => setIncoterm(e.target.value)}>
                {INCOTERMS.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Валюта</label>
              <select className="field" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label className="lbl">Фрахт</label><input className="field" value={freight} onChange={(e) => setFreight(e.target.value)} placeholder="0" inputMode="decimal" /></div>
            <div><label className="lbl">Страхування</label><input className="field" value={insurance} onChange={(e) => setInsurance(e.target.value)} placeholder="0" inputMode="decimal" /></div>
            <div><label className="lbl">Курс → UAH</label><input className="field" value={fx} onChange={(e) => setFx(e.target.value)} placeholder="напр. 42" inputMode="decimal" /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,170px) 1fr', gap: 12, marginBottom: 18 }}>
            <div>
              <label className="lbl">AI-провайдер</label>
              <select className="field" value={provider} onChange={(e) => { setProvider(e.target.value); localStorage.setItem('lap_ai_provider', e.target.value); }}>
                {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">API-ключ (BYOK) — для перевірок ЄС/UA, лише у браузері</label>
              <input className="field" type="password" value={apiKey} autoComplete="off"
                onChange={(e) => { setApiKey(e.target.value); localStorage.setItem('lap_ai_key', e.target.value); }}
                placeholder="sk-... (необов'язково)" />
            </div>
          </div>

          <button className="btn-go" onClick={run} disabled={busy}>
            {busy ? <><span className="spinner" /> Аналіз…</> : 'Запустити аналіз ▶'}
          </button>
        </div>
      </div>

      {showArchive && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div className="lbl" style={{ margin: 0 }}>Архів перевірок</div>
            {archive.length > 0 && <button className="btn" onClick={() => { clearArchive(); setArchive([]); }}>Очистити</button>}
          </div>
          {archive.length === 0 ? (
            <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Порожньо. Кожен аналіз зберігається сюди автоматично.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {archive.map((e) => (
                <button key={e.ts} onClick={() => openEntry(e)} className="btn" style={{ justifyContent: 'space-between', width: '100%' }}>
                  <span>{e.name}</span>
                  <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 12 }}>
                    {e.count} поз · {fmt(e.total)} {e.currency} · {e.when}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div className="card" style={{ borderColor: 'var(--red)', color: 'var(--red-bright)', marginBottom: 20 }}>{error}</div>}

      {result && (
        <Results r={result} currency={currency} ai={ai} aiBusy={aiBusy} aiError={aiError} hasKey={!!apiKey.trim()}
          onExport={() => exportReport(result, currency, ai)} />
      )}
    </main>
  );
}

function CheckList({ checks }: { checks: { item: string; status: string; note: string }[] }) {
  if (!checks?.length) return <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>—</span>;
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
      {checks.map((c, i) => (
        <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.45 }}>
          <span className={pillClass(c.status)} style={{ border: 'none', padding: 0 }}>●</span>
          <span><b>{c.item}</b>{c.note ? <span style={{ color: 'var(--ink-2)' }}> — {c.note}</span> : null}</span>
        </li>
      ))}
    </ul>
  );
}

function Results({
  r, currency, ai, aiBusy, aiError, hasKey, onExport,
}: {
  r: AnalysisResult; currency: string; ai: AiResponse | null; aiBusy: boolean; aiError: string; hasKey: boolean; onExport: () => void;
}) {
  const s = r.calc.summary;
  const metrics = [
    { k: 'Митна вартість', v: s.totalCustomsValue, cls: '' },
    { k: 'Мито', v: s.totalDuty, cls: 'is-duty' },
    { k: 'ПДВ', v: s.totalVAT, cls: 'is-vat' },
    { k: 'До сплати', v: s.totalPayable, cls: 'is-total' },
  ];
  const aiByName = new Map<string, AiItem>();
  if (ai) for (const it of ai.items) aiByName.set(normalize(it.name), it);

  return (
    <div>
      <div className="banner">
        <span className="banner-mono">▶ ЛИСТ «{r.selectedSheetName}»{r.selectedSheetDate ? ` · ${r.selectedSheetDate}` : ''}</span>
        <div style={{ color: 'var(--ink-2)', marginTop: 4 }}>{r.reason}. Проігноровано: {r.ignored.length}.</div>
      </div>

      <div className="sec-head">
        <span className="sec-num">01</span><span className="sec-title">Фінансова зведена</span><span className="sec-line" />
        <button className="btn" onClick={onExport}>⭳ Експорт .xlsx</button>
      </div>
      <div className="metrics">
        {metrics.map((m) => (
          <div key={m.k} className={`metric ${m.cls}`}>
            <div className="metric-label">{m.k}</div>
            <div className={`metric-value ${m.v.estimated ? 'est' : ''}`}>
              {m.v.estimated ? '~' : ''}{fmt(m.v.value)} <span className="cur">{currency}</span>
            </div>
          </div>
        ))}
      </div>

      {hasKey && aiBusy && <div className="card" style={{ marginBottom: 16, color: 'var(--ink-2)' }}><span className="spinner" /> AI аналізує перевірки ЄС/UA…</div>}
      {aiError && <div className="card" style={{ marginBottom: 16, borderColor: 'var(--red)', color: 'var(--red-bright)' }}>AI: {aiError}</div>}
      {ai?.criticalAlert && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--red)' }}>
          <div className="lbl" style={{ color: 'var(--red-bright)' }}>Критичний фактор</div>
          <div style={{ fontSize: 14 }}>{ai.criticalAlert}</div>
        </div>
      )}
      {ai?.nctsList?.length ? (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--amber)' }}>
          <div className="lbl" style={{ color: 'var(--amber)' }}>NCTS · чекліст</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
            {ai.nctsList.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="sec-head"><span className="sec-num">02</span><span className="sec-title">Маніфест · розрахунок</span><span className="sec-line" /></div>
      <div className="tbl-card tbl-scroll" style={{ marginBottom: 8 }}>
        <table className="tbl">
          <thead>
            <tr>{['Товар', 'УКТЗЕД', 'К-сть, кг', 'Ціна', 'Митна варт.', 'Ставка', 'Мито', 'ПДВ', 'Разом', 'Прапорці'].map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {r.lines.map((l, i) => {
              const flags: { t: string; c: string }[] = [];
              if (l.resolved.precursor) flags.push({ t: `Прекурсор Т${l.resolved.precursor.table}`, c: 'pill-red' });
              if (l.resolved.adr) flags.push({ t: `ADR ${l.resolved.adr.class}`, c: 'pill-yellow' });
              if (l.resolved.origin) flags.push({ t: l.resolved.origin.originType, c: 'pill-muted' });
              if (l.calc.needsReview) flags.push({ t: 'перевірити', c: 'pill-yellow' });
              return (
                <tr key={i}>
                  <td style={{ minWidth: 200, fontWeight: 600 }}>{l.calc.name}</td>
                  <td className="mono" style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{l.resolved.code.value ?? '—'}</td>
                  <td className="mono">{fmt(l.calc.qtyKg)}</td>
                  <td className="mono">{fmt(l.calc.goodsValue.value / (l.calc.qtyKg || 1))}</td>
                  <td><Cell v={l.calc.customsValue} /></td>
                  <td><Cell v={l.calc.dutyRatePercent} suffix="%" /></td>
                  <td><Cell v={l.calc.duty} /></td>
                  <td><Cell v={l.calc.vat} /></td>
                  <td style={{ fontWeight: 600 }}><Cell v={l.calc.totalPayable} /></td>
                  <td style={{ minWidth: 150 }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {flags.map((f, k) => <span key={k} className={`pill ${f.c}`}>{f.t}</span>)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ai && (
        <>
          <div className="sec-head"><span className="sec-num">03</span><span className="sec-title">Перевірки для брокера · ЄС / UA</span><span className="sec-line" /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {r.lines.map((l, i) => {
              const it = aiByName.get(normalize(l.calc.name));
              if (!it) return null;
              return (
                <div key={i} className="card">
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                    <b>{l.calc.name}</b>
                    {it.risk && <span className={it.risk === 'Критичний' ? 'pill pill-red' : it.risk === 'Середній' ? 'pill pill-yellow' : 'pill pill-green'}>ризик: {it.risk}</span>}
                    {it.originShortNote && <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>{it.originShortNote}</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                    <div><div className="lbl" style={{ color: 'var(--ink)' }}>🇪🇺 Транзит ЄС</div><CheckList checks={it.euChecks} /></div>
                    <div><div className="lbl" style={{ color: 'var(--ink)' }}>🇺🇦 Розмитнення UA</div><CheckList checks={it.uaChecks} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {r.warnings.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="lbl" style={{ color: 'var(--yellow)' }}>Застереження ({r.warnings.length})</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.6 }}>
            {r.warnings.slice(0, 12).map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <p style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 16, lineHeight: 1.5 }}>
        «~» — оцінка (фрахт ×1.10 або груба ставка глави). Ставки мита у Фазі 1 — з мігрованої таблиці, звіряйте з офіційним тарифом.
      </p>
    </div>
  );
}
