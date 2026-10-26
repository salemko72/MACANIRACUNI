-- One household; Access and the Worker allowlist protect every API operation.
-- No demo rows or user identities belong in this migration.
CREATE TABLE IF NOT EXISTS family_bills (
  id TEXT PRIMARY KEY NOT NULL,
  template_id TEXT NOT NULL,
  billing_month TEXT NOT NULL,
  body TEXT NOT NULL CHECK (json_valid(body)),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (template_id, billing_month)
);
CREATE TABLE IF NOT EXISTS ai_scan_usage (
  day TEXT PRIMARY KEY NOT NULL,
  calls INTEGER NOT NULL CHECK(calls >= 0)
);
