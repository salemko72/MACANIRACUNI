# Scanning and Family Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task.

**Goal:** Camera/PDF intake with local OCR, review and retention, then private family synchronization.
**Architecture:** Independent extraction engine, scanner UI/local documents, root integration and authenticated Worker/D1 backend.
**Tech Stack:** React/TS/Vite, Tesseract.js, PDF.js, IndexedDB, Cloudflare Access JWT, Workers/D1.
**Spec:** docs/superpowers/specs/2026-10-26-scanning-family-design.md

## Constraints
Keep nine templates, local edits and backups compatible. Preserve payment on intake. User emails stay out of repository. No public bill APIs. Never upload demo seed automatically.

## Review Focus
OCR ambiguity, wrong billing month from receipt date, duplicate document, storage/quota failure, concurrent family writes/offline edits.

## Tasks
- [x] Extraction engine and semantic parser: src/scanning/extraction.ts, recognize.ts, tests; local OCR assets and actual OCR verification.
- [x] Scanner UI and IndexedDB originals: src/scanning/Scanner.tsx, documents.ts, tests; capture/progress/review/cancel/manual correction and failure states.
- [x] Family backend: server/worker.ts, migration SQL, tests; signed JWT, allowlist, origin checks, per-bill CAS revisions.
- [x] Root integration: scan receipt mapping, document viewer, real/demo labels, secure API sync state, family login UI and first-use behavior.
- [x] Full domain/browser tests including real synthetic OCR, auth failures and concurrency; deploy and verify public/private behavior; update docs and GitHub.

Verification: 81 unit/server tests, 38 local browser tests. Public suite runs the production app with dev-only harness tests skipped. Actual email-code delivery requires the users to initiate login; no unsolicited codes were sent. Final review found and resolved stale detail field overwrites and cross-tab pending writes.

