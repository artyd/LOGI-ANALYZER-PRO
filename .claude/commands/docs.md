---
description: Витягти чистий текст + ідентифікатори (CAS/UN/HS) з документів на товар
---

Run the document extractor on the file/folder in $ARGUMENTS:

`python scripts/doc_extract.py "<path>" -o doc_out [--ai] [--lang eng+chi_sim+ukr]`

Then summarize, per document, the extracted structured fields (CAS, UN, HS,
purity, manufacturer, country, batch, product) and flag anything marked
`needs_ocr` (scanned — needs system tesseract; see `scripts/requirements-doc.txt`).

Explain how each identifier can boost accuracy: CAS → substance identity → code;
UN → ADR class; explicit HS → authoritative code. `doc_out/` is git-ignored.

If asked to wire these into the engine: the intended fusion is a new top authority
tier in `lib/engines/resolve.ts` — document identifiers OVER name matching
(UN→ADR uses the existing `un` field in `ADR_SUBSTANCE_DB`; explicit HS→`raw.uctzedCode`;
CAS→code needs a CAS→HS reference, seeded verifiably in `uktzed_code_db_extra.ts`).

$ARGUMENTS
