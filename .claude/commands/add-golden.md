---
description: Додати ЗВІРЕНИЙ людиною кейс у golden-набір точності
---

Add a new case to `tests/golden/cases.json` from the manifest line / expected
answer in $ARGUMENTS.

RULES:
- The `expect` values are HUMAN-VERIFIED TRUTH (a broker's correct answer), NOT
  the current engine output. If the truth isn't given or verifiable, ask — do not
  invent it, and do not run the engine and copy its result as the expectation.
- Only include `expect` fields you can defend (code / codeHs6 / dutyRatePercent /
  dutyRateSource / originType / originCategory / adrUn / precursorTable /
  warningIncludes). Omit the rest.
- After adding, run `npm run test:golden`. If the new case FAILS, that's a real
  signal the engine is wrong for this input — investigate `lib/engines/`, don't
  bend the expectation. Report the accuracy delta.

The harness fields are documented in `tests/golden/harness.ts`.

$ARGUMENTS
