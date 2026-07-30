---
description: Забандлити статутний тариф UA (2697-IX) з офіційного файла у рушій
---

Bundle the statutory 10-digit UA tariff from an official file (XLSX/CSV path in
$ARGUMENTS) into `lib/data/ua_tariff10.json`:

1. Run `npm run build-tariff10 -- "<path>"` (script: `scripts/build-tariff10.ts`,
   reuses column auto-detect from `lib/tariff/tariff.ts`).
2. Report how many positions / how many 10-digit codes were ingested.
3. Run `npx vitest run tests/statutory.spec.ts` and `npm run test:golden` to check
   nothing regressed and to see the accuracy effect.

IMPORTANT: only bundle REAL data from an authoritative file (QDPro/1С export or
official 2697-IX XLSX). Never hand-write or fabricate rates into the JSON. If the
file looks wrong (e.g. export-only duties, missing rate column), stop and report
rather than bundling garbage. After a real bundle, the statutory rate becomes
authoritative (`source: 'db'`) above the WITS HS-6 fallback.

$ARGUMENTS
