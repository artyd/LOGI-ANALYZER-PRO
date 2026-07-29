# LOGI-ANALYZER PRO v3 — прогрес

План: `C:\Users\a.svystelnyk\.claude\plans\velvety-wandering-shore.md`

## Фаза 0 — Каркас ✅ (в основному)
- [x] Next.js 16 (App Router, TS, Tailwind v4) + Turbopack.
- [x] Залежності: zod, drizzle-orm, @neondatabase/serverless, drizzle-kit, vitest.
- [x] Zod-контракт `lib/types/contract.ts` (єдине джерело правди).
- [x] Схема Neon/Drizzle `lib/db/schema.ts` (12 таблиць) + `drizzle/0000_init.sql`.
- [x] Клієнт БД `lib/db/client.ts`, `drizzle.config.ts`, `vercel.json`, `.env.example`.
- [ ] Порт `globals.css` / шрифтів / layout з index.html (UI 1:1) — далі.
- [ ] `scripts/export-json-schema.ts` (Zod → JSON Schema для Python) — далі.

## Фаза 1 — MVP (у процесі)
- [x] **Движок 1 — платежі** `lib/engines/payment.ts` (чистий, детермінований).
      Реальна митна вартість за Incoterms; ×1.10 лише як позначений fallback;
      ПДВ 20/7/0 за режимом; мито не «вигадується»; кожне число з {value,estimated,source}.
- [x] **Порт `selectActualSheet`** `lib/sheets/selectActualSheet.ts` (1:1).
- [x] **Міграція 6 KB** → `lib/data/*.json` через `scripts/extract-kb.mjs`
      (origin 356, manuf 36, adr 18, uktzed 70, hs_duty 72, precursor 22).
- [x] **Движок 2 (in-memory)** `lib/engines/classify.ts` — код УКТЗЕД, груба ставка (kb_coarse),
      походження, ADR, прекурсори; нормалізоване зіставлення замість наївного substring.
- [x] **Резолвер грунтування** `lib/engines/resolve.ts` — код→ставка→походження→прекурсор → CalcLineInput.
- [x] **BYOK-проксі** `app/api/ai/route.ts` + `lib/ai/providers.ts` — server-side, ключі не логуються,
      прибрано anthropic-dangerous-direct-browser-access; моделі оновлені/перевизначувані.
- [x] **Грунтований промпт** `lib/ai/prompt.ts` + схема `lib/ai/schema.ts` — єдина CURRENT_DATE,
      «тільки CONTEXT», без грошових полів, без галюцинованих «правил ЄС».
- [x] **Сид-скрипт** `scripts/seed/seed.ts` — готовий, АЛЕ не запускався (нема Neon). Перевірити при деплої.
- [x] **Тести**: 42 passed (payment, selectActualSheet, classify, resolve). `next build` OK.
- [ ] Отримати + імпортувати реальний Митний тариф UA → hs_code/duty_rate/vat_rate(20/7)/DCFTA.
- [ ] Движок 2 у Python (trigram/embedding через pg_trgm) — після Neon.
- [x] **UI-термінал (клієнтський)** `app/Terminal.tsx` — завантаження Excel/CSV або демо, форма
      Incoterms/фрахт/страхування/курс, живий детермінований розрахунок у браузері, таблиця з
      бейджами джерела/оцінки, зведена, застереження. Парсинг `lib/sheets/parse.ts` (SheetJS),
      пайплайн `lib/pipeline/deterministic.ts`.
- [x] **Деплой на Vercel живий і публічний** — https://logi-analyzer-pro-djtourist11-1877s-projects.vercel.app
      (framework=nextjs, protection off; автодеплой з GitHub).
- [x] **AI-перевірки ЄС/UA** — `/api/checks` (грунтований промпт) + BYOK у терміналі; картки ЄС/UA, критичний алерт, NCTS.
- [x] **Дизайн «Control Room» перенесено 1:1** — шрифти JetBrains Mono/Instrument Sans/Serif (next/font), палітра dark+light, фонова сітка+glow, topbar, deck, метрики, таблиця, пілюлі, лоадер (`app/globals.css`, `app/Topbar.tsx`, `app/layout.tsx`). Перемикач теми (без миготіння).
- [x] **Google Sheets URL** — проксі `/api/sheet` (CORS-safe, парсинг на сервері).
- [x] **XLSX-експорт** `lib/export/xlsx.ts` (Зведена/Детальний/ЄС/UA) + **архів** `lib/archive.ts` (localStorage, ≤50, відкриття).
- [ ] Картки можливого походження (originOptions) з вибором і перебудовою перевірок.
- [ ] Оркестратор `/api/analyze` (коли додамо RAG/БД).
- [ ] Реальний Митний тариф UA; Neon-міграція + сид (після DATABASE_URL).
- [ ] Паритет-фікстури старий-vs-новий.

## Потрібно від власника
1. **Neon**: створити БД, дати `DATABASE_URL` (Vercel → Storage → Neon, або neon.tech). Далі: `npx drizzle-kit migrate`.
2. **Датасет УКТЗЕД зі ставками**: підтвердити джерело (Митний тариф Закон №3006-IX / Держмитслужба) або надати вивантаження; інакше стартуємо на мігрованій грубій HS_DUTY_TABLE (позначено `estimated`).
3. **Приклади маніфестів** (Excel) для паритет-тестів старий-vs-новий і зростання golden-набору.

## Команди
- `npm test` — юніт-тести (Vitest).
- `npx tsc --noEmit` — типова перевірка.
- `npx drizzle-kit generate` — нова міграція зі схеми.
- `npm run dev` — локальний Next.js.
