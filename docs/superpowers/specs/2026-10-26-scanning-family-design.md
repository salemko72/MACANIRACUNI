# Skeniranje i porodična evidencija

User authorized scanning, high-quality automated extraction with minimal effort, and family synchronization for two supplied emails. Keep existing nine monthly templates and mobile overview. No automatic payments or Gmail integration.

Architecture: browser image/PDF extraction with local OCR; review suggestions before updating one expected bill. Keep receipt/payment independent and never duplicate a monthly template. Store originals locally in IndexedDB for this increment; clearly describe locality and backup limitations. Metadata can synchronize privately after email OTP login through Cloudflare Access. D1 stores a single household's versioned bill records; authenticated optimistic concurrency prevents silent overwrites.

Email allowlist is infrastructure configuration, never commit personal emails to the public repository. API validates signed Access JWT issuer/audience/expiry AND configured email allowlist, rejects cross-origin writes, and returns no-store responses. Public frontend remains accessible as local demo, private API is Access protected. Never seed or automatically upload demo amounts into the shared family ledger. First family use starts with expected empty monthly bills; optional local import requires explicit user choice.

Extraction: image capture/upload, image normalization, PDF text then rendered-page OCR fallback, progress/cancel, confidence and warnings, manual corrections, preview before save, retained original. Reject unsupported files and oversize input. OCR language/core/worker assets hosted on same origin, loaded on demand; first extraction needs internet.

Rollout: test fake invoices and two simulated clients; deploy OCR with private API disabled until Access settings and API validation are verified. Do not require user to re-enter known property/provider/month when confidently inferred.
