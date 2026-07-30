---
description: Гейт якості перед комітом — typecheck + усі тести + production build
---

Run the full quality gate for this repo, in order, and report each result plainly:

1. `npx tsc --noEmit` — типи чисті?
2. `npx vitest run` — усі тести проходять? (show count)
3. `npx next build` — production build ОК?

If anything fails, stop and fix the root cause (do not weaken tests or types to
pass). If all green, say so and it's safe to commit. Clean up any temp artifacts
(`doc_out/`, `_probe.*`, `scratch_*`, `_synth_*`) before finishing.

$ARGUMENTS
