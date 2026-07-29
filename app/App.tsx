'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { parseFile } from '@/lib/sheets/parse';
import type { SheetInput } from '@/lib/sheets/selectActualSheet';
import { analyzeDeterministic, type AnalysisResult } from '@/lib/pipeline/deterministic';
import { normalize } from '@/lib/engines/classify';
import type { NumberWithSource } from '@/lib/types/contract';
import type { AiResponse, AiItem } from '@/lib/ai/schema';
import { exportReport } from '@/lib/export/xlsx';
import { loadArchive, saveToArchive, clearArchive, type ArchiveEntry } from '@/lib/archive';
import { buildQdProGoodInfoUrl } from '@/lib/engines/origin';
import { parseTariffRows, buildTariffTable, type TariffEntry, type TariffTable } from '@/lib/tariff/tariff';
import zedTopicsRaw from '@/lib/data/zed_topics.json';

interface ZedTopic { ico: string; topic: string; short: string; sections: { title: string; rows: [string, string][] }[] }
const ZED_TOPICS = zedTopicsRaw as ZedTopic[];
const confLabel = (c: string) => (c === 'high' ? 'ВИСОКА' : c === 'medium' ? 'СЕРЕДНЯ' : 'НИЗЬКА');
const confColor = (c: string) => (c === 'high' ? 'var(--green-bright)' : c === 'medium' ? 'var(--yellow)' : 'var(--red-bright)');

const PROVIDER_META: Record<string, { label: string; placeholder: string }> = {
  openai: { label: 'OpenAI', placeholder: 'sk-proj-...' },
  gemini: { label: 'Gemini', placeholder: 'AIzaSy...' },
  claude: { label: 'Claude', placeholder: 'sk-ant-...' },
  openrouter: { label: 'OpenRouter', placeholder: 'sk-or-...' },
};
const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];
const CURRENCIES = ['USD', 'EUR', 'UAH', 'CNY'];
const fmt = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SRC_LABEL: Record<string, string> = { user: 'з таблиці', db: 'тариф', kb_coarse: 'груба ставка', ai: 'AI', fallback: 'оцінка', unknown: '—' };

const DEMO: SheetInput[] = [{
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
}];

function Cell({ v, suffix }: { v: NumberWithSource | null; suffix?: string }) {
  if (!v) return <span style={{ color: 'var(--ink-3)' }}>—</span>;
  return (
    <span style={{ fontFamily: 'var(--mono)', color: v.estimated ? 'var(--yellow)' : 'inherit' }} title={`джерело: ${SRC_LABEL[v.source] ?? v.source}`}>
      {v.estimated ? '~' : ''}{fmt(v.value)}{suffix ?? ''}
    </span>
  );
}
const pillCls = (s: string) => (s === 'red' ? 'var(--red-bright)' : s === 'green' ? 'var(--green-bright)' : s === 'yellow' ? 'var(--yellow)' : 'var(--ink-3)');

export default function App() {
  const [page, setPage] = useState<'new' | 'arch' | 'zed'>('new');
  const [mode, setMode] = useState<'batch' | 'single'>('batch');

  // BYOK key card
  const [provider, setProvider] = useState('claude');
  const [apiKey, setApiKey] = useState('');
  const [keyOnline, setKeyOnline] = useState(false);
  const [akcFlipped, setAkcFlipped] = useState(false);
  const [akcProv, setAkcProv] = useState('openai');
  const [keyInput, setKeyInput] = useState('');

  // source + params
  const [driveUrl, setDriveUrl] = useState('');
  const [fileSheets, setFileSheets] = useState<SheetInput[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [incoterm, setIncoterm] = useState('CIF');
  const [currency, setCurrency] = useState('USD');
  const [freight, setFreight] = useState('');
  const [insurance, setInsurance] = useState('');
  const [fx, setFx] = useState('');
  const [vatRegime, setVatRegime] = useState('standard_20');
  const [tariff, setTariff] = useState<TariffTable | null>(null);
  const [tariffCount, setTariffCount] = useState(0);

  // single
  const [spName, setSpName] = useState('');
  const [spCode, setSpCode] = useState('');

  // results
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [ai, setAi] = useState<AiResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState('');
  const [aiError, setAiError] = useState('');

  const [archive, setArchive] = useState<ArchiveEntry[]>([]);
  const [zedIdx, setZedIdx] = useState<number | null>(null);

  const sceneRef = useRef<HTMLDivElement>(null);
  const batchRef = useRef<HTMLDivElement>(null);
  const singleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = localStorage.getItem('lap_provider'); if (p) setProvider(p);
    const keys = (() => { try { return JSON.parse(localStorage.getItem('lap_provider_keys') || '{}'); } catch { return {}; } })();
    const active = p && keys[p];
    if (active) { setApiKey(active); setKeyOnline(true); }
    setArchive(loadArchive());
    try {
      const t = JSON.parse(localStorage.getItem('lap_tariff') || 'null') as TariffEntry[] | null;
      if (t && t.length) { setTariff(buildTariffTable(t)); setTariffCount(t.length); }
    } catch { }
  }, []);

  useLayoutEffect(() => {
    const scene = sceneRef.current;
    const face = mode === 'single' ? singleRef.current : batchRef.current;
    if (scene && face && face.offsetHeight > 0) scene.style.height = face.offsetHeight + 'px';
  });

  function toggleTheme() {
    const light = document.documentElement.classList.toggle('theme-light');
    try { localStorage.setItem('lap_theme', light ? 'light' : 'dark'); } catch { }
  }

  function akcSelectProv(p: string) { setAkcProv(p); setKeyInput(''); setAkcFlipped(true); }
  function saveKey() {
    const v = keyInput.trim();
    if (!v) return;
    setProvider(akcProv); setApiKey(v); setKeyOnline(true);
    try {
      localStorage.setItem('lap_provider', akcProv);
      const keys = JSON.parse(localStorage.getItem('lap_provider_keys') || '{}');
      keys[akcProv] = v; localStorage.setItem('lap_provider_keys', JSON.stringify(keys));
    } catch { }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setError(''); setResult(null); setAi(null);
    try {
      const parsed = await parseFile(f);
      setFileSheets(parsed); setFileName(`📄 ${f.name} · ${parsed.length} лист(ів)`);
    } catch (err) { setError(`Не вдалося прочитати файл: ${(err as Error).message}`); }
  }

  async function onTariffFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setError('');
    try {
      const sheets = await parseFile(f);
      const entries: TariffEntry[] = sheets.flatMap((s) => parseTariffRows(s.rows));
      if (!entries.length) { setError('У файлі тарифу не знайдено колонок «код» + «ставка мита». Перевірте заголовки.'); return; }
      setTariff(buildTariffTable(entries)); setTariffCount(entries.length);
      try { localStorage.setItem('lap_tariff', JSON.stringify(entries)); } catch { }
    } catch (err) { setError(`Тариф: ${(err as Error).message}`); }
  }

  function clearTariff() {
    setTariff(null); setTariffCount(0);
    try { localStorage.removeItem('lap_tariff'); } catch { }
  }

  function shipmentInput() {
    return {
      incoterm, currency,
      freight: freight ? Number(freight) : null,
      insurance: insurance ? Number(insurance) : null,
      fxToUAH: fx ? Number(fx) : null, fxDate: null,
    };
  }

  function persist(res: AnalysisResult, aiRes: AiResponse | null, srcLabel: string) {
    const entry: ArchiveEntry = {
      ts: Date.now(), when: new Date().toLocaleString('uk-UA'),
      name: `${srcLabel} · ${res.selectedSheetName}`, count: res.lines.length,
      total: res.calc.summary.totalPayable.value, currency, result: res, ai: aiRes,
    };
    setArchive(saveToArchive(entry));
  }

  async function runAi(res: AnalysisResult, srcLabel: string) {
    if (!apiKey.trim()) { persist(res, null, srcLabel); return; }
    setAi(null); setAiError(''); setAiBusy(true);
    try {
      const items = res.lines.map((l) => {
        const rec = l.originOptions.find((o) => o.recommended) ?? l.originOptions[0];
        return {
          name: l.calc.name, uctzedCode: l.resolved.code.value,
          codeConfidence: l.resolved.code.confidence ?? 'low',
          dutyRatePercent: l.calc.dutyRatePercent?.value ?? null, dutyRateSource: l.resolved.code.source,
          originType: l.resolved.origin?.originType ?? null,
          recommendedOrigin: rec ? `${rec.shortLabel} (впевненість ${rec.confidence})` : null,
          category: l.resolved.origin?.category ?? '',
          precursorNote: l.resolved.precursor?.note ?? null,
        };
      });
      const r = await fetch('/api/checks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, apiKey, items }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setAi(data as AiResponse); persist(res, data as AiResponse, srcLabel);
    } catch (e) { setAiError((e as Error).message); persist(res, null, srcLabel); }
    finally { setAiBusy(false); }
  }

  async function runAudit() {
    setError(''); setAi(null);
    let sheets = fileSheets;
    let srcLabel = fileName || 'Файл';
    try {
      setBusy(true);
      if (!sheets && driveUrl.trim()) {
        const r = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: driveUrl.trim() }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        sheets = data.sheets as SheetInput[]; srcLabel = '🔗 Google Sheets';
      }
      if (!sheets) { setError('Завантажте файл, вставте посилання Google Sheets або натисніть «Демо».'); return; }
      const res = analyzeDeterministic(sheets, shipmentInput(), new Date(), vatRegime as any, tariff);
      setResult(res); void runAi(res, srcLabel);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  function runDemo() {
    setError(''); setAi(null); setBusy(true);
    try {
      const res = analyzeDeterministic(DEMO, shipmentInput(), new Date(), vatRegime as any, tariff);
      setResult(res); void runAi(res, 'Демо-дані');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  function runSingleProduct() {
    if (!spName.trim()) { setError('Введіть назву товару.'); return; }
    setError(''); setAi(null); setBusy(true);
    try {
      const sheets: SheetInput[] = [{ name: 'single', rows: [['Номенклатура', 'Кількість, кг', 'Ціна', 'УКТЗЕД'], [spName, '1', '0', spCode]] }];
      const res = analyzeDeterministic(sheets, shipmentInput(), new Date(), vatRegime as any, tariff);
      setResult(res); void runAi(res, `🧪 ${spName}`);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  function openEntry(e: ArchiveEntry) {
    setResult(e.result); setAi(e.ai); setCurrency(e.currency); setPage('new');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const navBtn = (id: 'new' | 'arch' | 'zed', txt: string) => (
    <button className={`nav-btn ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}>{txt}</button>
  );

  return (
    <>
      {/* TOP BAR */}
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#" onClick={(e) => { e.preventDefault(); setPage('new'); }}>
            <div className="brand-mark">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18" /><path d="M12 3c2.8 3 2.8 15 0 18" /><path d="M12 3c-2.8 3-2.8 15 0 18" />
                <path d="M4.5 7h15M4.5 17h15" />
                <circle cx="16.5" cy="8" r="1.3" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <div className="brand-text">
              <span className="brand-title">LOGI·ANALYZER</span>
              <span className="brand-sub">Freight Intelligence Terminal</span>
            </div>
          </a>
          <nav className="nav-links">
            {navBtn('new', 'Новий аналіз')}{navBtn('arch', 'Архів')}{navBtn('zed', 'База знань')}
          </nav>
          <div className="topbar-meta">
            <button className="theme-btn" onClick={toggleTheme} aria-label="Toggle Theme">
              <svg className="moon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
              <svg className="sun" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            </button>
            <div className={`api-chip`} onClick={() => { setKeyOnline(false); setAkcFlipped(false); }} title="Керування API ключами">
              <span className={`api-dot ${keyOnline ? 'ok' : ''}`}></span>
              <span>{keyOnline ? `${PROVIDER_META[provider]?.label ?? provider} ONLINE` : 'API OFFLINE'}</span>
              {keyOnline && <span className="api-chip-change">· змінити</span>}
            </div>
          </div>
        </div>
      </header>

      {/* NEW ANALYSIS */}
      <main className={`page ${page === 'new' ? 'active' : ''}`} id="page-new">
        {!keyOnline && (
          <div className="akc-scene" id="keyBanner">
            <div className={`akc-card ${akcFlipped ? 'flipped' : ''}`}>
              <div className="akc-face">
                <div className="akc-eyebrow">Оберіть провайдера AI</div>
                <div className="akc-providers">
                  {(['openai', 'gemini', 'claude', 'openrouter'] as const).map((p) => (
                    <button key={p} className="akc-prov" onClick={() => akcSelectProv(p)}>
                      <svg className="akc-prov-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
                      </svg>
                      {PROVIDER_META[p].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="akc-face akc-back">
                <div className="akc-back-top">
                  <button className="akc-back-btn" onClick={() => setAkcFlipped(false)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
                    Назад
                  </button>
                  <span className="akc-back-provname">{PROVIDER_META[akcProv]?.label}</span>
                </div>
                <div className="akc-back-heading">Введіть API-ключ</div>
                <div className="akc-input-row">
                  <input className="akc-input" type="password" placeholder={PROVIDER_META[akcProv]?.placeholder} autoComplete="off"
                    value={keyInput} onChange={(e) => setKeyInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveKey(); }} />
                  <button className="akc-confirm" onClick={saveKey}>Підтвердити</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <section className="deck">
          <div className="deck-head"><div className="deck-head-left">SYSTEM READY · Ingestion Bay</div></div>
          <div className="deck-body">
            <div className="mode-switch" data-mode={mode} role="tablist">
              <span className="mode-switch-indicator" aria-hidden="true"></span>
              <button type="button" className={`mode-opt ${mode === 'batch' ? 'active' : ''}`} data-mode="batch" onClick={() => setMode('batch')}>
                <svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" /></svg>
                Збірна партія
              </button>
              <button type="button" className={`mode-opt ${mode === 'single' ? 'active' : ''}`} data-mode="single" onClick={() => setMode('single')}>
                <svg viewBox="0 0 24 24"><path d="M10 2v7.31" /><path d="M14 9.3V2" /><path d="M8.5 2h7" /><path d="M14 9.3a6.5 6.5 0 1 1-4 0" /><path d="M5.58 16.5h12.85" /></svg>
                Один продукт
              </button>
            </div>

            <div className="deck-flip-scene" id="deckFlipScene" ref={sceneRef}>
              <div className={`deck-flip-card ${mode === 'single' ? 'flipped' : ''}`}>
                <div className="deck-flip-face deck-flip-front" ref={batchRef}>
                  <h1 className="deck-title">Аналіз <em>збірної партії</em> перед відправкою з Європи до України</h1>
                  <p className="deck-lede">Завантажте маніфест у форматі Google&nbsp;Sheets, Excel або CSV. Система автоматично розрахує митні платежі, підготує чекліст документів та оцінить ризики транзиту через порти&nbsp;ЄС.</p>
                  <div className="input-row">
                    <div className="url-wrap">
                      <input className="url-input" type="text" placeholder="docs.google.com/spreadsheets/d/..." value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} />
                    </div>
                    <button className="go-btn" onClick={runAudit} disabled={busy}>
                      <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      <span>{busy ? 'Аналіз…' : 'Запустити аналіз'}</span>
                      {busy && <div className="spinner" />}
                    </button>
                  </div>
                  <div className="or-divider">or · upload file</div>
                  <label htmlFor="fileUpload" className="file-upload-label">
                    <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
                    Завантажити Excel або CSV
                  </label>
                  <input type="file" id="fileUpload" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileUpload} />
                  <div className="file-name-badge">{fileName}</div>
                  <button className="go-btn" style={{ marginTop: 14, background: 'var(--surface-3)', color: 'var(--ink)', boxShadow: 'none' }} onClick={runDemo}>Демо-дані</button>

                  {/* Офіційний тариф (файл користувача) */}
                  <div style={{ marginTop: 16, padding: '10px 14px', border: `1px solid ${tariff ? 'var(--amber)' : 'var(--line-2)'}`, borderRadius: 'var(--radius)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: tariff ? 'var(--amber)' : 'var(--ink-3)' }}>
                      ТАРИФ: {tariff ? `${tariffCount} позицій (офіційний)` : 'вбудована груба таблиця'}
                    </span>
                    <label className="btn" style={{ cursor: 'pointer', padding: '6px 12px', fontSize: 13 }}>
                      ↥ Оновити тариф (УКТЗЕД+ставки)
                      <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onTariffFile} />
                    </label>
                    {tariff && <button className="btn" style={{ padding: '6px 12px', fontSize: 13 }} onClick={clearTariff}>Скинути</button>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginTop: 22, textAlign: 'left' }}>
                    <ParamSelect label="Incoterm" v={incoterm} set={setIncoterm} opts={INCOTERMS} />
                    <ParamSelect label="Валюта" v={currency} set={setCurrency} opts={CURRENCIES} />
                    <ParamInput label="Фрахт" v={freight} set={setFreight} />
                    <ParamInput label="Страхування" v={insurance} set={setInsurance} />
                    <ParamInput label="Курс→UAH" v={fx} set={setFx} />
                    <div>
                      <label style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-3)', display: 'block', marginBottom: 4 }}>ПДВ</label>
                      <select value={vatRegime} onChange={(e) => setVatRegime(e.target.value)} style={selStyle}>
                        <option value="standard_20">20% (загальна)</option>
                        <option value="medicine_7">7% (зареєстр. ЛЗ)</option>
                        <option value="zero_0">0%</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="deck-flip-face deck-flip-back" ref={singleRef}>
                  <h1 className="deck-title">Аналіз <em>одного продукту</em> для логіста та брокера</h1>
                  <p className="deck-lede">Введіть назву товару та код УКТЗЕД. Система визначить можливе походження, перевірки транзиту&nbsp;ЄС та&nbsp;UA, орієнтовні платежі та логістичні ризики.</p>
                  <div className="sp-form">
                    <div className="sp-form-head">Аналіз одного продукту</div>
                    <div className="sp-grid">
                      <div className="sp-field sp-col-span">
                        <label className="sp-label">Назва товару<span className="sp-req">*</span></label>
                        <input className="sp-input" type="text" autoComplete="off" placeholder="напр. Метронідазол, ПВП, Лізин..." value={spName} onChange={(e) => setSpName(e.target.value)} />
                      </div>
                      <div className="sp-field sp-col-span">
                        <label className="sp-label">Код УКТЗЕД / HS</label>
                        <input className="sp-input" type="text" inputMode="numeric" autoComplete="off" placeholder="напр. 2933299090 — або залиште порожнім" value={spCode} onChange={(e) => setSpCode(e.target.value)} />
                      </div>
                    </div>
                    <div className="sp-actions">
                      <button className="sp-go-btn" onClick={runSingleProduct} disabled={busy}>
                        <span className="sp-go-bar" aria-hidden="true"></span>
                        <span className="sp-go-content">
                          <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                          <span>{busy ? 'Аналіз…' : 'Проаналізувати продукт'}</span>
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div id="resultsArea">
          {error && <div className="metric" style={{ borderColor: 'var(--red)', color: 'var(--red-bright)', marginTop: 20 }}>{error}</div>}
          {result && <Results r={result} currency={currency} ai={ai} aiBusy={aiBusy} aiError={aiError} hasKey={!!apiKey.trim()} onExport={() => exportReport(result, currency, ai)} />}
        </div>
      </main>

      {/* ARCHIVE */}
      <main className={`page ${page === 'arch' ? 'active' : ''}`} id="page-arch">
        <h1 className="page-title">Архів <em>перевірок</em></h1>
        <div className="page-sub">{archive.length} records{archive.length > 0 && <> · <a className="link" style={{ cursor: 'pointer' }} onClick={() => { clearArchive(); setArchive([]); }}>очистити</a></>}</div>
        <div id="archList">
          {archive.length === 0 ? (
            <div className="arch-empty">Архів порожній — запустіть перший аналіз</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              {archive.map((e) => (
                <button key={e.ts} className="go-btn" style={{ justifyContent: 'space-between', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', boxShadow: 'none', width: '100%' }} onClick={() => openEntry(e)}>
                  <span>{e.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-3)', fontSize: 12 }}>{e.count} поз · {fmt(e.total)} {e.currency} · {e.when}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* KNOWLEDGE BASE */}
      <main className={`page ${page === 'zed' ? 'active' : ''}`} id="page-zed">
        <h1 className="page-title">База знань <em>ЗЕД</em></h1>
        <div className="page-sub">Reference · EU → UA customs operations · {ZED_TOPICS.length} тем</div>
        {zedIdx === null ? (
          <div className="zed-grid" id="zedGrid">
            {ZED_TOPICS.map((t, i) => (
              <div className="zed-card" key={i} onClick={() => setZedIdx(i)}>
                <div className="zed-ico">{t.ico}</div>
                <h4>{t.topic}</h4>
                <p>{t.short}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="zed-detail open" id="zedDetail">
            <button className="zed-back" onClick={() => setZedIdx(null)}>← Назад</button>
            <div className="zed-detail-title">{ZED_TOPICS[zedIdx].ico} {ZED_TOPICS[zedIdx].topic}</div>
            <div className="zed-detail-sub">{ZED_TOPICS[zedIdx].short}</div>
            {ZED_TOPICS[zedIdx].sections.map((s, si) => (
              <div className="zed-sec" key={si}>
                <h5>{s.title}</h5>
                {s.rows.map((row, ri) => (
                  <div className="zed-row" key={ri}><span className="zed-k">{row[0]}</span><span className="zed-v">{row[1]}</span></div>
                ))}
              </div>
            ))}
          </div>
        )}
      </main>

      <footer>
        <strong>LOGI·ANALYZER PRO</strong> · © 2026 · Freight Intelligence Terminal for Logistics Professionals &amp; Customs Brokers
      </footer>
    </>
  );
}

function ParamSelect({ label, v, set, opts }: { label: string; v: string; set: (s: string) => void; opts: string[] }) {
  return (
    <div>
      <label style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-3)', display: 'block', marginBottom: 4 }}>{label}</label>
      <select value={v} onChange={(e) => set(e.target.value)} style={selStyle}>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>
    </div>
  );
}
function ParamInput({ label, v, set }: { label: string; v: string; set: (s: string) => void }) {
  return (
    <div>
      <label style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-3)', display: 'block', marginBottom: 4 }}>{label}</label>
      <input value={v} onChange={(e) => set(e.target.value)} placeholder="0" inputMode="decimal" style={selStyle} />
    </div>
  );
}
const selStyle: React.CSSProperties = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--radius-sm)', color: 'var(--ink)', padding: '8px 10px', fontFamily: 'var(--mono)', fontSize: 13, outline: 'none' };

function CheckList({ checks }: { checks: { item: string; status: string; note: string }[] }) {
  if (!checks?.length) return <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>—</span>;
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
      {checks.map((c, i) => (
        <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.45 }}>
          <span style={{ color: pillCls(c.status), flex: '0 0 auto' }}>●</span>
          <span><b>{c.item}</b>{c.note ? <span style={{ color: 'var(--ink-2)' }}> — {c.note}</span> : null}</span>
        </li>
      ))}
    </ul>
  );
}

function Results({ r, currency, ai, aiBusy, aiError, hasKey, onExport }: { r: AnalysisResult; currency: string; ai: AiResponse | null; aiBusy: boolean; aiError: string; hasKey: boolean; onExport: () => void }) {
  const s = r.calc.summary;
  const [originSel, setOriginSel] = useState<Record<number, string>>({});
  const metrics = [
    { k: 'Митна вартість', v: s.totalCustomsValue, cls: '' },
    { k: 'Мито', v: s.totalDuty, cls: 'is-duty' },
    { k: 'ПДВ', v: s.totalVAT, cls: 'is-vat' },
    { k: 'До сплати', v: s.totalPayable, cls: 'is-total' },
  ];
  const aiByName = new Map<string, AiItem>();
  if (ai) for (const it of ai.items) aiByName.set(normalize(it.name), it);

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ background: 'var(--surface-2)', borderLeft: '3px solid var(--amber)', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)', fontSize: 13 }}>▶ ЛИСТ «{r.selectedSheetName}»{r.selectedSheetDate ? ` · ${r.selectedSheetDate}` : ''}</span>
        <div style={{ color: 'var(--ink-2)', marginTop: 4, fontSize: 13 }}>{r.reason}. Проігноровано: {r.ignored.length}.</div>
      </div>

      <div className="sec-head">
        <span className="sec-num">01</span><span className="sec-title">Фінансова зведена</span><span className="sec-line" />
        <button className="go-btn" style={{ height: 40, padding: '0 16px', background: 'var(--surface-3)', color: 'var(--ink)', boxShadow: 'none' }} onClick={onExport}>⭳ Експорт .xlsx</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 8 }}>
        {metrics.map((m) => (
          <div key={m.k} className={`metric ${m.cls}`}>
            <div className="metric-label">{m.k}</div>
            <div className="metric-value" style={{ color: m.v.estimated ? 'var(--yellow)' : undefined }}>
              {m.v.estimated ? '~' : ''}{fmt(m.v.value)} <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{currency}</span>
            </div>
          </div>
        ))}
      </div>

      {hasKey && aiBusy && <div className="metric" style={{ marginTop: 16, color: 'var(--ink-2)' }}><span className="spinner" /> AI аналізує перевірки ЄС/UA…</div>}
      {aiError && <div className="metric" style={{ marginTop: 16, borderColor: 'var(--red)', color: 'var(--red-bright)' }}>AI: {aiError}</div>}
      {ai?.criticalAlert && <div className="metric is-total" style={{ marginTop: 16 }}><div className="metric-label" style={{ color: 'var(--red-bright)' }}>Критичний фактор</div><div style={{ fontSize: 14 }}>{ai.criticalAlert}</div></div>}
      {ai?.nctsList?.length ? (
        <div className="metric" style={{ marginTop: 16 }}><div className="metric-label" style={{ color: 'var(--amber)' }}>NCTS · чекліст</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>{ai.nctsList.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      ) : null}

      <div className="sec-head"><span className="sec-num">02</span><span className="sec-title">Маніфест · розрахунок</span><span className="sec-line" /></div>
      <div className="tbl-card">
        <div className="tbl-scroll">
          <table style={{ tableLayout: 'auto', minWidth: 940 }}>
            <thead><tr>{['Товар', 'УКТЗЕД', 'К-сть, кг', 'Ціна', 'Митна варт.', 'Ставка', 'Мито', 'ПДВ', 'Разом', 'Прапорці'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {r.lines.map((l, i) => {
                const flags: { t: string; c: string }[] = [];
                if (l.resolved.precursor) flags.push({ t: `Прекурсор Т${l.resolved.precursor.table}`, c: 'var(--red-bright)' });
                if (l.resolved.adr) flags.push({ t: `ADR ${l.resolved.adr.class}`, c: 'var(--yellow)' });
                if (l.resolved.origin) flags.push({ t: l.resolved.origin.originType, c: 'var(--ink-3)' });
                if (l.calc.needsReview) flags.push({ t: 'перевірити', c: 'var(--yellow)' });
                return (
                  <tr key={i}>
                    <td className="td-name">{l.calc.name}</td>
                    <td className="td-code">
                      {l.resolved.code.value ?? '—'}
                      {l.resolved.code.confidence && l.resolved.code.value && (
                        <span title={`впевненість коду: ${l.resolved.code.confidence}`}
                          style={{ marginLeft: 6, color: confColor(l.resolved.code.confidence) }}>●</span>
                      )}
                      {l.resolved.codeIssue && (
                        <span title={l.resolved.codeIssue} style={{ marginLeft: 4, color: 'var(--red-bright)' }}>⚠</span>
                      )}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{fmt(l.calc.qtyKg)}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{fmt(l.calc.goodsValue.value / (l.calc.qtyKg || 1))}</td>
                    <td><Cell v={l.calc.customsValue} /></td>
                    <td><Cell v={l.calc.dutyRatePercent} suffix="%" /></td>
                    <td><Cell v={l.calc.duty} /></td>
                    <td><Cell v={l.calc.vat} /></td>
                    <td style={{ fontWeight: 600 }}><Cell v={l.calc.totalPayable} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {flags.map((f, k) => <span key={k} style={{ fontSize: 11, color: f.c, border: `1px solid ${f.c}`, borderRadius: 6, padding: '1px 7px', whiteSpace: 'nowrap' }}>{f.t}</span>)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Origin cards */}
      <div className="sec-head"><span className="sec-num">03</span><span className="sec-title">Можливе походження · перевірки за типом</span><span className="sec-line" /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {r.lines.map((l, i) => {
          const opts = l.originOptions;
          if (!opts.length) return null;
          const recKey = opts.find((o) => o.recommended)?.key ?? opts[0].key;
          const selKey = originSel[i] ?? recKey;
          const sel = opts.find((o) => o.key === selKey) ?? opts[0];
          const qurl = buildQdProGoodInfoUrl(l.resolved.code.value);
          return (
            <div className="metric" key={i}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 10 }}>
                <b>{l.calc.name}</b>
                {l.resolved.code.value && <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-3)', fontSize: 12 }}>{l.resolved.code.value}</span>}
                <a className="qdpro-link" style={{ marginLeft: 'auto', fontSize: 12 }} href={qurl} target="_blank" rel="noopener">QDPro goodinfo ↗</a>
              </div>
              {l.resolved.hsDescription && (
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 10, fontFamily: 'var(--mono)' }}>
                  HS (офіц.): {l.resolved.hsDescription}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {opts.map((o) => {
                  const active = o.key === selKey;
                  return (
                    <button key={o.key} onClick={() => setOriginSel((s2) => ({ ...s2, [i]: o.key }))}
                      style={{ cursor: 'pointer', textAlign: 'left', padding: '8px 12px', borderRadius: 8, background: active ? 'var(--amber-dim)' : 'var(--surface-2)', border: `1px solid ${active ? 'var(--amber)' : 'var(--line-2)'}`, color: 'var(--ink)', minWidth: 130 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{o.shortLabel}{o.recommended ? ' ★' : ''}</div>
                      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '.1em', color: confColor(o.confidence), marginTop: 3 }}>{confLabel(o.confidence)}</div>
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 12 }}>{sel.basis}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                <div><div className="metric-label" style={{ color: 'var(--ink)' }}>🇪🇺 Транзит ЄС</div><CheckList checks={[...sel.euChecks, ...l.appChecks.eu]} /></div>
                <div><div className="metric-label" style={{ color: 'var(--ink)' }}>🇺🇦 Розмитнення UA</div><CheckList checks={[...sel.uaChecks, ...l.appChecks.ua]} /></div>
                <div><div className="metric-label" style={{ color: 'var(--ink)' }}>🚚 Транзит / логістика</div><CheckList checks={sel.transitChecks} /></div>
              </div>
            </div>
          );
        })}
      </div>

      {ai && (
        <>
          <div className="sec-head"><span className="sec-num">04</span><span className="sec-title">AI-перевірки для брокера · ЄС / UA</span><span className="sec-line" /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {r.lines.map((l, i) => {
              const it = aiByName.get(normalize(l.calc.name));
              if (!it) return null;
              return (
                <div key={i} className="metric">
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                    <b>{l.calc.name}</b>
                    {it.risk && <span style={{ fontSize: 11, color: it.risk === 'Критичний' ? 'var(--red-bright)' : it.risk === 'Середній' ? 'var(--yellow)' : 'var(--green-bright)', border: '1px solid currentColor', borderRadius: 6, padding: '1px 8px' }}>ризик: {it.risk}</span>}
                    {it.originShortNote && <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>{it.originShortNote}</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                    <div><div className="metric-label" style={{ color: 'var(--ink)' }}>🇪🇺 Транзит ЄС</div><CheckList checks={it.euChecks} /></div>
                    <div><div className="metric-label" style={{ color: 'var(--ink)' }}>🇺🇦 Розмитнення UA</div><CheckList checks={it.uaChecks} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {r.warnings.length > 0 && (
        <div className="metric" style={{ marginTop: 16 }}>
          <div className="metric-label" style={{ color: 'var(--yellow)' }}>Застереження ({r.warnings.length})</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.6 }}>{r.warnings.slice(0, 12).map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
