# LOGI-ANALYZER PRO

Аналіз збірних вантажів (фарм/хім) на транзит через ЄС та імпорт в Україну:
розрахунок митних платежів, коди УКТЗЕД, походження, комплаєнс-перевірки.

## Структура репозиторію

| Шлях | Що це |
|------|-------|
| `logi-analyzer/` | **Активна версія v3** — Next.js 16 (App Router, TS) + рушії на TS, готова до Python-функцій. Розгортається на Vercel. |
| `index.html` | Legacy v2.3 — старий монолітний застосунок (один файл). Зберігається для довідки та паритет-тестів. |
| `LOGI-ANALYZER-PRO-updated-v2.3.md` | Документація legacy-версії. |

## Розгортання на Vercel

1. Імпортувати цей репозиторій у Vercel.
2. **Root Directory:** вказати `logi-analyzer` (застосунок лежить у підпапці).
3. Framework Preset: Next.js (визначиться автоматично).
4. Змінні оточення — див. `logi-analyzer/.env.example` (`DATABASE_URL` — Neon Postgres, коли буде готовий).

## Розробка (локально)

```bash
cd logi-analyzer
npm install
npm run dev        # http://localhost:3000
npm test           # юніт-тести рушіїв (Vitest)
npm run build      # продакшн-білд
```

Деталі прогресу та наступні кроки — `logi-analyzer/PROGRESS.md`.
