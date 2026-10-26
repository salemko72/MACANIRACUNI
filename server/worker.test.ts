import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import worker, { createHandler, type Env } from "./worker";

const origin = "https://bills.example";
const issuer = "https://family.cloudflareaccess.com";
const bill = {
  id: "2026-10_s-water",
  templateId: "s-water",
  billingMonth: "2026-10",
  receiptStatus: "received",
  paymentStatus: "unpaid",
  currency: "BAM",
  amount: 20,
};
let key: CryptoKey;
let handler: ReturnType<typeof createHandler>;
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  key = pair.privateKey;
  handler = createHandler({
    keys: createLocalJWKSet({
      keys: [{ ...(await exportJWK(pair.publicKey)), kid: "test" }],
    }),
  });
});
async function token(
  overrides: Record<string, unknown> = {},
  signingKey = key,
) {
  return new SignJWT({
    email: "member@example.com",
    iss: issuer,
    aud: "family-audience",
    sub: "member",
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .sign(signingKey);
}
function environment() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  const env: Env = {
    ACCESS_ISSUER: issuer,
    ACCESS_AUDIENCE: "family-audience",
    ALLOWED_EMAILS: "member@example.com, second@example.com",
    DB: {
      prepare(sql: string) {
        let values: (string | number)[] = [];
        return {
          bind(...args: (string | number)[]) {
            values = args;
            return this;
          },
          async first<T>() {
            return (db.prepare(sql).get(...values) as T | undefined) ?? null;
          },
          async all<T>() {
            return { results: db.prepare(sql).all(...values) as T[] };
          },
        };
      },
    },
    ASSETS: {
      async fetch() {
        return new Response("public shell");
      },
    },
  };
  return { env, db };
}
async function request(
  path: string,
  env: Env,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return handler.fetch(
    new Request(origin + path, {
      method: body === undefined ? "GET" : "PUT",
      headers: {
        "Cf-Access-Jwt-Assertion": await token(),
        ...(body === undefined
          ? {}
          : { Origin: origin, "Content-Type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
  );
}

describe("private family API", () => {
  it("fails closed until Access configuration exists, even with a spoofed email", async () => {
    const response = await worker.fetch(
      new Request(origin + "/api/session", {
        headers: { "Cf-Access-Authenticated-User-Email": "member@example.com" },
      }),
      {} as Env,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "auth_not_configured" });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("serves the public shell without Access configuration", async () => {
    const { env } = environment();
    delete env.ACCESS_AUDIENCE;
    expect(await (await worker.fetch(new Request(origin), env)).text()).toBe(
      "public shell",
    );
  });
  it("verifies a signed identity and ignores the untrusted email header", async () => {
    const { env } = environment();
    const response = await request("/api/session", env, undefined, {
      "Cf-Access-Authenticated-User-Email": "attacker@example.com",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: "member@example.com" });
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
  it("rejects forged, expired, wrong-audience, wrong-issuer and unlisted identities", async () => {
    const { env } = environment();
    const other = await generateKeyPair("RS256");
    for (const bad of [
      await token({}, other.privateKey),
      await token({ exp: 1 }),
      await token({ aud: "wrong" }),
      await token({ iss: "https://wrong.example" }),
      await token({ email: "attacker@example.com" }),
    ]) {
      const response = await request("/api/bills", env, undefined, {
        "Cf-Access-Jwt-Assertion": bad,
      });
      expect([401, 403]).toContain(response.status);
      expect(response.headers.get("Cache-Control")).toContain("no-store");
    }
    const spoof = await handler.fetch(
      new Request(origin + "/api/bills", {
        headers: { "Cf-Access-Authenticated-User-Email": "member@example.com" },
      }),
      env,
    );
    expect(spoof.status).toBe(401);
  });
  it("starts with no shared bills and performs revisioned per-record writes", async () => {
    const { env } = environment();
    expect(await (await request("/api/bills", env)).json()).toEqual({
      bills: [],
    });
    const inserted = await request("/api/bills/" + bill.id, env, {
      bill,
      revision: 0,
    });
    expect(inserted.status).toBe(200);
    expect(await inserted.json()).toEqual({ bill, revision: 1 });
    const edited = { ...bill, amount: 30 };
    expect(
      await (
        await request("/api/bills/" + bill.id, env, {
          bill: edited,
          revision: 1,
        })
      ).json(),
    ).toEqual({ bill: edited, revision: 2 });
    const stale = await request("/api/bills/" + bill.id, env, {
      bill: { ...bill, amount: 99 },
      revision: 1,
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({
      code: "revision_conflict",
      current: { bill: edited, revision: 2 },
    });
    expect(await (await request("/api/bills", env)).json()).toEqual({
      bills: [{ bill: edited, revision: 2 }],
    });
  });
  it("allows one winner for concurrent edits and prevents duplicate template/month insertion", async () => {
    const { env } = environment();
    await request("/api/bills/" + bill.id, env, { bill, revision: 0 });
    const results = await Promise.all(
      [10, 11].map((amount) =>
        request("/api/bills/" + bill.id, env, {
          bill: { ...bill, amount },
          revision: 1,
        }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const duplicate = await request("/api/bills/another-id", env, {
      bill: { ...bill, id: "another-id" },
      revision: 0,
    });
    expect(duplicate.status).toBe(409);
    const conflict = (await duplicate.json()) as {
      current: { bill: { id: string } };
    };
    expect(conflict.current.bill.id).toBe(bill.id);
  });
  it("rejects cross-origin and originless writes and malformed payloads", async () => {
    const { env } = environment();
    for (const Origin of ["https://attacker.example", "", "null"]) {
      expect(
        (
          await request(
            "/api/bills/" + bill.id,
            env,
            { bill, revision: 0 },
            { Origin },
          )
        ).status,
      ).toBe(403);
    }
    for (const value of [
      { bill: { ...bill, dueDate: "2026-02-30" }, revision: 0 },
      { bill, revision: -1 },
      { bill, revision: 1.5 },
      { bill: { ...bill, id: "wrong" }, revision: 0 },
      { bill: { ...bill, unexpected: true }, revision: 0 },
    ]) {
      expect((await request("/api/bills/" + bill.id, env, value)).status).toBe(
        400,
      );
    }
    expect(
      (
        await request("/api/bills/" + bill.id, env, {
          bill: { ...bill, notes: "x".repeat(40000) },
          revision: 0,
        })
      ).status,
    ).toBe(413);
    expect(await (await request("/api/bills", env)).json()).toEqual({
      bills: [],
    });
  });
});

it("preserves scan metadata as percentages but rejects coerced statuses and invalid metadata", async () => {
  const { env } = environment();
  const scanned = {
    ...bill,
    documentId: "local-doc-1",
    confidence: 86,
    isDemo: false,
  };
  expect(
    await (
      await request("/api/bills/" + bill.id, env, {
        bill: scanned,
        revision: 0,
      })
    ).json(),
  ).toEqual({ bill: scanned, revision: 1 });
  for (const patch of [
    { receiptStatus: ["received"] },
    { paymentStatus: ["unpaid"] },
    { source: ["paper"] },
    { balanceType: ["debt"] },
    { confidence: 101 },
    { documentId: "../file" },
    { isDemo: "false" },
  ]) {
    expect(
      (
        await request("/api/bills/" + bill.id, env, {
          bill: { ...bill, ...patch },
          revision: 1,
        })
      ).status,
    ).toBe(400);
  }
});
it("keeps record identity immutable and leaves unrelated records untouched", async () => {
  const { env } = environment();
  await request("/api/bills/" + bill.id, env, { bill, revision: 0 });
  const other = {
    ...bill,
    id: "2026-11_s-water",
    billingMonth: "2026-11",
    amount: 55,
  };
  await request("/api/bills/" + other.id, env, { bill: other, revision: 0 });
  expect(
    (
      await request("/api/bills/" + bill.id, env, {
        bill: { ...bill, billingMonth: "2026-12" },
        revision: 1,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await request("/api/bills/" + bill.id, env, {
        bill: { ...bill, amount: 25 },
        revision: 1,
      })
    ).status,
  ).toBe(200);
  expect(await (await request("/api/bills", env)).json()).toEqual({
    bills: [
      { bill: { ...bill, amount: 25 }, revision: 2 },
      { bill: other, revision: 1 },
    ],
  });
});
it("uses private JSON errors for malformed JSON, wrong media types and storage failures", async () => {
  const { env } = environment();
  const malformed = await handler.fetch(
    new Request(origin + "/api/bills/" + bill.id, {
      method: "PUT",
      body: "{",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "Cf-Access-Jwt-Assertion": await token(),
      },
    }),
    env,
  );
  expect(malformed.status).toBe(400);
  expect(await malformed.json()).toEqual({ code: "invalid_json" });
  expect(
    (
      await request(
        "/api/bills/" + bill.id,
        env,
        { bill, revision: 0 },
        { "Content-Type": "text/plain" },
      )
    ).status,
  ).toBe(415);
  expect(malformed.headers.get("Access-Control-Allow-Origin")).toBeNull();
  env.DB = {
    prepare() {
      throw new Error("private database details");
    },
  };
  const failed = await request("/api/bills", env);
  expect(failed.status).toBe(500);
  expect(await failed.json()).toEqual({ code: "internal_error" });
  expect(failed.headers.get("Cache-Control")).toContain("no-store");
});
it("redirects verified login/logout only to fixed local locations", async () => {
  const { env } = environment();
  expect(
    (
      await request("/api/login?next=https://attacker.example", env)
    ).headers.get("Location"),
  ).toBe("/#settings");
  expect((await request("/api/logout", env)).headers.get("Location")).toBe(
    "/cdn-cgi/access/logout",
  );
});
