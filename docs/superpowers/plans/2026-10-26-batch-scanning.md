# Batch invoice scanning implementation plan

Goal: select all invoice images/PDFs once, automatically recognize them sequentially with the existing authenticated Mistral API, review together, and save selected invoices without silent replacement or false payment status.

Architecture: keep the single scanner intact; add a batch scanner with sequential bounded processing and shared original PDF documents. Each PDF page is one review candidate. No ledger writes until explicit save. Originals stay in IndexedDB; metadata follows the current ledger mode and existing durable family outbox.

- [x] Extend PDF reader with cancellable page counting and explicit page recognition; regression tests preserve default single-page behavior.
- [x] Add bounded selection (20 candidates, 20MB/file, 100MB total), staged duplicate checks, progress/cancel/resume, editable review, duplicate target detection, explicit replacement, and partial save recovery.
- [x] Integrate “Skeniraj sve račune”, preserve shared originals if a later candidate fails to save, and retain real payment status.
- [x] Verify meaningful browser flows (mixed success/failure, replacement, collisions, retry, cancel, multiselection, mobile), review, build, deploy, confirm current version.

Decisions: process one AI request at a time for phone memory and existing daily quota; show selection/candidate limits before AI work. Shared PDF originals are saved once by document id; successful saves stay saved if a later candidate fails. Existing real values need replacement confirmation. Two selected candidates for the same supplier/month cannot both save. No automatic payment marking.

Review ruling: a known PDF is reread rather than skipped as a whole, so unsaved pages remain recoverable after reopening. It reuses the existing original id; target-level confirmation protects already saved invoices. This consumes AI quota again for reread pages, stated in UI. Added a failing/passing reopen regression after review caught the gap.

Verification: 127 unit/server/PDF lifecycle tests, build, and all 59 browser checks passed. The single-scanner harness needed its recognizer mock updated to export the new PDF page-count helper; no production fallback was added for a test-only contract. Independent review found no remaining blocking P1/P2. Published via existing Worker, preserving Access/D1/AI bindings. Actual authenticated in-app batch sent two synthetic invoice photos to Mistral and recovered 123.45 KM electricity/Nišići/September2026/due20October and32.70 KM water/Sarajevo/September2026/due21October. Both appeared in one review; synthetic invoices were not saved to the household ledger. Published build2026-10-26 20:59:54 Europe/Sarajevo.
