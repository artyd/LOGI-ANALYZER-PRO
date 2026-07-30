---
description: Безпечно розширити довідник УКТЗЕД (синоніми/коди) — лише реальні коди
---

Add substance synonyms / a code to the overlay `lib/data/uktzed_code_db_extra.ts`
based on $ARGUMENTS.

HARD RULES (this file exists to RAISE precision, not lower it):
- Every `code` MUST already be a real HS/UKTZED code — verify the 6-digit prefix
  exists via `lib/engines/validate.ts` / `hs_valid6.json` before adding. Never add
  an invented or "probably" code.
- Prefer adding SYNONYMS (uk/ru/en/trade forms) to an existing correct entry over
  creating a new code entry.
- Keep the existing entry shape `{ keys: [...], code, name }`. Comments Ukrainian.
- After editing, run `npx vitest run` and `npm run test:golden` — nothing may
  regress; report the accuracy effect.

If the correct code is uncertain, say so and ask — do not guess.

$ARGUMENTS
