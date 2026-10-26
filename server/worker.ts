import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { validateBills } from "../src/backup";
import type { Bill } from "../src/domain";
import { SCAN_MODEL, SCAN_PROMPT, parseAiInvoice } from "./scan";

// A narrow structural binding contract also allows SQLite integration tests.
// D1Database and Fetcher satisfy these interfaces without runtime adapters.
interface Statement {
  bind(...values: (string | number)[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
}
export interface Env {
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
  DB: { prepare(sql: string): Statement };
  ASSETS: { fetch(request: Request): Promise<Response> };
  ACCESS_ISSUER?: string;
  ACCESS_AUDIENCE?: string;
  ALLOWED_EMAILS?: string;
}
interface Row {
  body: string;
  revision: number;
}
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cf-Access-Jwt-Assertion, Cookie",
};
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers });
const redirect = (location: string) =>
  new Response(null, {
    status: 302,
    headers: { ...headers, Location: location },
  });
const record = (row: Row) => ({
  bill: JSON.parse(row.body) as Bill,
  revision: row.revision,
});
const maxBodyBytes = 32 * 1024;
class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

function authConfig(env: Env) {
  if (
    !env.ACCESS_ISSUER ||
    !env.ACCESS_AUDIENCE?.trim() ||
    !env.ALLOWED_EMAILS?.trim()
  )
    return null;
  try {
    const issuer = new URL(env.ACCESS_ISSUER);
    if (
      issuer.protocol !== "https:" ||
      issuer.username ||
      issuer.password ||
      issuer.search ||
      issuer.hash ||
      issuer.pathname !== "/"
    )
      return null;
    const emails = env.ALLOWED_EMAILS.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (
      !emails.length ||
      emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    )
      return null;
    return {
      issuer: issuer.origin,
      audience: env.ACCESS_AUDIENCE.trim(),
      emails,
    };
  } catch {
    return null;
  }
}

async function boundedJson(
  request: Request,
  limit = maxBodyBytes,
): Promise<unknown> {
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new ApiError(415, "json_required");
  const length = request.headers.get("Content-Length");
  if (length && Number(length) > limit)
    throw new ApiError(413, "body_too_large");
  if (!request.body) throw new ApiError(400, "invalid_body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ApiError(413, "body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, "invalid_json");
  }
}
const billFields = new Set([
  "id",
  "templateId",
  "billingMonth",
  "receiptStatus",
  "paymentStatus",
  "amount",
  "currency",
  "dueDate",
  "issueDate",
  "receivedAt",
  "paidAt",
  "previousBalance",
  "balanceType",
  "source",
  "notes",
  "documentId",
  "isDemo",
  "confidence",
]);
function writePayload(
  value: unknown,
  id: string,
): { bill: Bill; revision: number } {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    const body = value as Record<string, unknown>;
    if (
      Object.keys(body).some((key) => !["bill", "revision"].includes(key)) ||
      !Number.isSafeInteger(body.revision) ||
      (body.revision as number) < 0 ||
      (body.revision as number) >= Number.MAX_SAFE_INTEGER
    )
      throw new Error();
    const [bill] = validateBills([body.bill]);
    const fields = bill as Bill & Record<string, unknown>;
    for (const field of [
      "receiptStatus",
      "paymentStatus",
      "source",
      "balanceType",
    ]) {
      if (fields[field] !== undefined && typeof fields[field] !== "string")
        throw new Error();
    }
    if (
      Object.keys(bill).some((key) => !billFields.has(key)) ||
      bill.id !== id ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(bill.id)
    )
      throw new Error();
    if (bill.notes !== undefined && bill.notes.length > 8000) throw new Error();
    if (
      fields.documentId !== undefined &&
      (typeof fields.documentId !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(fields.documentId))
    )
      throw new Error();
    if (fields.isDemo !== undefined && typeof fields.isDemo !== "boolean")
      throw new Error();
    if (
      fields.confidence !== undefined &&
      (typeof fields.confidence !== "number" ||
        !Number.isFinite(fields.confidence) ||
        fields.confidence < 0 ||
        fields.confidence > 100)
    )
      throw new Error();
    for (const field of ["receivedAt", "paidAt"] as const) {
      const date = bill[field];
      if (
        date !== undefined &&
        !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(date)
      )
        throw new Error();
    }
    return { bill, revision: body.revision as number };
  } catch {
    throw new ApiError(400, "invalid_bill");
  }
}

export function createHandler(options: { keys?: JWTVerifyGetKey } = {}) {
  let aiHealth:
    { active: boolean; checkedAt: string; expiresAt: number } | undefined;
  // JWKS cache is cryptographic material only; no request or household data.
  let cachedIssuer: string | undefined;
  let cachedKeys: ReturnType<typeof createRemoteJWKSet> | undefined;
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== "/api" && !url.pathname.startsWith("/api/"))
        return env.ASSETS.fetch(request);
      try {
        const config = authConfig(env);
        if (!config) return json({ code: "auth_not_configured" }, 503);
        const assertion =
          request.headers.get("Cf-Access-Jwt-Assertion") ??
          request.headers
            .get("Cookie")
            ?.split(";")
            .map((part) => part.trim())
            .find((part) => part.startsWith("CF_Authorization="))
            ?.slice("CF_Authorization=".length);
        if (!assertion) return json({ code: "unauthenticated" }, 401);
        let email: string;
        try {
          if (!options.keys && cachedIssuer !== config.issuer) {
            cachedKeys = createRemoteJWKSet(
              new URL(config.issuer + "/cdn-cgi/access/certs"),
            );
            cachedIssuer = config.issuer;
          }
          const { payload } = await jwtVerify(
            assertion,
            options.keys ?? cachedKeys!,
            {
              issuer: config.issuer,
              audience: config.audience,
              algorithms: ["RS256"],
              requiredClaims: ["exp", "email", "sub"],
            },
          );
          if (typeof payload.email !== "string")
            throw new Error("missing email");
          email = payload.email.trim().toLowerCase();
        } catch {
          return json({ code: "unauthenticated" }, 401);
        }
        if (!config.emails.includes(email))
          return json({ code: "forbidden" }, 403);
        if (request.method === "GET" && url.pathname === "/api/session")
          return json({ email });
        if (request.method === "GET" && url.pathname === "/api/ai/status") {
          if (!env.AI)
            return json({ active: false, code: "ai_not_configured" }, 503);
          if (!aiHealth || aiHealth.expiresAt < Date.now()) {
            let active = false;
            try {
              const output = (await env.AI.run(SCAN_MODEL, {
                messages: [{ role: "user", content: "Reply with exactly OK." }],
                max_tokens: 4,
                temperature: 0,
              })) as {
                response?: string;
                choices?: { message?: { content?: string } }[];
              };
              active = /\bOK\b/i.test(
                output?.response ??
                  output?.choices?.[0]?.message?.content ??
                  "",
              );
            } catch {
              /* A provider error must never become a green indicator. */
            }
            aiHealth = {
              active,
              checkedAt: new Date().toISOString(),
              expiresAt: Date.now() + (active ? 300000 : 30000),
            };
          }
          return json(
            {
              active: aiHealth.active,
              checkedAt: aiHealth.checkedAt,
              model: "Mistral Vision",
            },
            aiHealth.active ? 200 : 502,
          );
        }
        if (request.method === "GET" && url.pathname === "/api/login")
          return redirect(
            url.searchParams.get("next") === "scan" ? "/#scan" : "/#settings",
          );
        if (request.method === "GET" && url.pathname === "/api/logout")
          return redirect("/cdn-cgi/access/logout");
        if (!env.DB) return json({ code: "storage_not_configured" }, 503);
        if (request.method === "POST" && url.pathname === "/api/scan") {
          if (request.headers.get("Origin") !== url.origin)
            throw new ApiError(403, "origin_forbidden");
          if (!env.AI) throw new ApiError(503, "ai_not_configured");
          const input = (await boundedJson(request, 4 * 1024 * 1024)) as {
            image?: unknown;
          };
          if (
            !input ||
            typeof input.image !== "string" ||
            !/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(
              input.image,
            )
          )
            throw new ApiError(400, "invalid_image");
          const today = new Date().toISOString().slice(0, 10);
          const reservation = await env.DB.prepare(
            "INSERT INTO ai_scan_usage(day, calls) VALUES (?1, 1) ON CONFLICT(day) DO UPDATE SET calls=calls+1 WHERE calls<20 RETURNING calls",
          )
            .bind(today)
            .first<{ calls: number }>();
          if (!reservation) throw new ApiError(429, "daily_scan_limit");
          try {
            const output = await env.AI.run(SCAN_MODEL, {
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: SCAN_PROMPT },
                    { type: "image_url", image_url: { url: input.image } },
                  ],
                },
              ],
              temperature: 0,
              max_tokens: 3000,
            });
            return json(parseAiInvoice(output));
          } catch {
            throw new ApiError(502, "ai_unavailable");
          }
        }
        if (request.method === "GET" && url.pathname === "/api/bills") {
          const { results } = await env.DB.prepare(
            "SELECT body, revision FROM family_bills ORDER BY billing_month, template_id",
          ).all<Row>();
          return json({ bills: results.map(record) });
        }
        const match = /^\/api\/bills\/([A-Za-z0-9_-]{1,128})$/.exec(
          url.pathname,
        );
        if (request.method === "PUT" && match) {
          if (request.headers.get("Origin") !== url.origin)
            throw new ApiError(403, "origin_forbidden");
          const { bill, revision } = writePayload(
            await boundedJson(request),
            match[1],
          );
          const serialized = JSON.stringify(bill);
          const now = new Date().toISOString();
          const row =
            revision === 0
              ? await env.DB.prepare(
                  "INSERT INTO family_bills (id, template_id, billing_month, body, revision, updated_by, updated_at) VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6) ON CONFLICT DO NOTHING RETURNING body, revision",
                )
                  .bind(
                    bill.id,
                    bill.templateId,
                    bill.billingMonth,
                    serialized,
                    email,
                    now,
                  )
                  .first<Row>()
              : await env.DB.prepare(
                  "UPDATE family_bills SET body = ?1, revision = revision + 1, updated_by = ?2, updated_at = ?3 WHERE id = ?4 AND revision = ?5 AND template_id = ?6 AND billing_month = ?7 RETURNING body, revision",
                )
                  .bind(
                    serialized,
                    email,
                    now,
                    bill.id,
                    revision,
                    bill.templateId,
                    bill.billingMonth,
                  )
                  .first<Row>();
          if (row) return json(record(row));
          const current = await env.DB.prepare(
            "SELECT body, revision FROM family_bills WHERE id = ?1 OR (template_id = ?2 AND billing_month = ?3) ORDER BY CASE WHEN id = ?1 THEN 0 ELSE 1 END LIMIT 1",
          )
            .bind(bill.id, bill.templateId, bill.billingMonth)
            .first<Row>();
          return json(
            {
              code: "revision_conflict",
              current: current ? record(current) : null,
            },
            409,
          );
        }
        return json({ code: "not_found" }, 404);
      } catch (error) {
        if (error instanceof ApiError)
          return json({ code: error.code }, error.status);
        // Do not log bill bodies, tokens or family identities.
        console.error(JSON.stringify({ event: "family_api_error" }));
        return json({ code: "internal_error" }, 500);
      }
    },
  };
}
export default createHandler();
