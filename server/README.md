# Family API

This Worker serves public static assets and a single-household private API. The D1 database starts empty: there is no demo seeding or whole-ledger overwrite endpoint. Original document files and OCR text stay on each device; bill records may contain a device-local document reference only.

Required bindings: `ASSETS` (static assets) and `DB` (D1, initialized with `server/schema.sql`). Required deployment secrets/settings:

- `ACCESS_ISSUER`: the HTTPS origin of the Cloudflare Access organization, without a path.
- `ACCESS_AUDIENCE`: the exact Access application audience.
- `ALLOWED_EMAILS`: comma-separated authorized household addresses. Set this privately; never commit real family addresses.

Protect `/api` and `/api/*` with Cloudflare Access, including login and session routes. The Worker also verifies the Access JWT signature against the issuer's `/cdn-cgi/access/certs`, issuer, audience, expiry and email claim, then checks the private allowlist. It never trusts the raw authenticated-email header. Missing or invalid auth configuration fails closed with HTTP 503 and `auth_not_configured`. Authentication failures return HTTP 401 JSON; a valid but unlisted identity gets HTTP 403.

## Contract

- `GET /api/session`: `{ email }` after verification.
- `GET /api/login`: after Access sign-in and Worker verification, redirects to `/#settings`.
- `GET /api/logout`: after verification, redirects to the local `/cdn-cgi/access/logout` endpoint.
- `GET /api/bills`: `{ bills: [{ bill, revision }] }`.
- `PUT /api/bills/:id`: JSON `{ bill, revision }`. Send the observed revision; use zero for a new bill. Success is `{ bill, revision }`, with revision starting at one and increasing once per successful write.
- A stale write or duplicate provider/month returns HTTP 409 `{ code: "revision_conflict", current: { bill, revision } | null }`. The client must resolve/merge against `current`; it must not silently retry overwriting that revision. IDs, template IDs and billing months cannot be changed by an update.

Every PUT must carry an `Origin` exactly equal to the request URL origin, plus `Content-Type: application/json`. Bodies are streamed with a 32 KiB cap (including when Content-Length is absent). Validation uses the shared bill validator with strict field/type/date checks; bill and document IDs are restricted to 1–128 ASCII alphanumeric, underscore or hyphen characters. Notes are at most 8,000 characters; scan confidence is a percentage from zero through 100. API responses, including errors and redirects, use `private, no-store` and `nosniff`, without CORS permission headers.

D1 mutations use parameterized, atomic INSERT/UPDATE with SQL revision predicates and RETURNING. The unique `(template_id, billing_month)` constraint prevents two devices inserting duplicate logical bills. Audit columns retain the latest writer and timestamp. No API accepts arbitrary SQL, another household ID, a delete, or a complete ledger replacement.

## Verification

`npm test` includes `server/worker.test.ts`. Those tests sign local RSA JWTs (no insecure runtime bypass), exercise normal production JWT verification with a local JWKS resolver, and execute the actual schema/queries on Node 24 SQLite through a narrow D1 adapter. They cover auth forgery, expiry, issuer/audience, allowlist, origin enforcement, bounds, per-record writes, uniqueness, concurrent revisions and immutable identities. Production Workers/D1 runtime and the live Access edge still require deployment smoke testing.
