---
description: Прогнати golden-набір і показати звіт точності рушія по полях
---

Run `npm run test:golden` and show the `══ GOLDEN ACCURACY ══` report (per-field
correct/total). If any case fails, show the failure lines (expected vs got) and
diagnose the engine cause in `lib/engines/`. Do NOT change golden expectations to
make a test pass — the golden values are human-verified truth; fix the engine, or
if the expectation itself is wrong, flag it explicitly and ask.

$ARGUMENTS
