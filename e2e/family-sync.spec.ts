import { test, expect, type Page, type Route } from "@playwright/test";
import type { Bill } from "../src/domain";

type Version = { bill: Bill; revision: number };
const initial: Bill = {
  id: "2026-10_s-water",
  templateId: "s-water",
  billingMonth: "2026-10",
  currency: "BAM",
  receiptStatus: "missing",
  paymentStatus: "unpaid",
  amount: 20,
  isDemo: false,
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function backend(records: Version[] = [{ bill: initial, revision: 1 }]) {
  const rows = new Map(
    records.map((rec) => [rec.bill.id, structuredClone(rec)]),
  );
  const writes: { bill: Bill; revision: number }[] = [];
  let holdPut: (() => Promise<void>) | undefined;
  let holdGet: (() => Promise<void>) | undefined;
  let failSession = false;
  let loggedOut = false;
  return {
    rows,
    writes,
    set holdPut(value: (() => Promise<void>) | undefined) {
      holdPut = value;
    },
    set holdGet(value: (() => Promise<void>) | undefined) {
      holdGet = value;
    },
    set failSession(value: boolean) {
      failSession = value;
    },
    async connect(page: Page) {
      await page.route("**/api/**", async (route: Route) => {
        const req = route.request(),
          path = new URL(req.url()).pathname;
        if (path === "/api/session") {
          if (failSession) {
            await route.abort("internetdisconnected");
            return;
          }
          await route.fulfill(
            loggedOut
              ? { status: 401, json: { code: "unauthenticated" } }
              : { json: { email: "member@example.test" } },
          );
          return;
        }
        if (path === "/api/logout") {
          loggedOut = true;
          await route.fulfill({
            status: 302,
            headers: { Location: "/#settings" },
          });
          return;
        }
        if (req.method() === "GET" && path === "/api/bills") {
          const snapshot = structuredClone([...rows.values()]);
          await holdGet?.();
          await route.fulfill({ json: { bills: snapshot } });
          return;
        }
        if (req.method() === "PUT") {
          const data = req.postDataJSON() as Version;
          writes.push(structuredClone(data));
          const gate = holdPut;
          holdPut = undefined;
          await gate?.();
          const current = rows.get(data.bill.id);
          if ((current?.revision ?? 0) !== data.revision) {
            await route.fulfill({
              status: 409,
              json: { code: "revision_conflict", current: current ?? null },
            });
            return;
          }
          const saved = { bill: data.bill, revision: data.revision + 1 };
          rows.set(data.bill.id, structuredClone(saved));
          await route.fulfill({ json: saved });
          return;
        }
        await route.fulfill({ status: 404, json: { code: "not_found" } });
      });
    },
  };
}
async function openFamily(page: Page, api: ReturnType<typeof backend>) {
  await api.connect(page);
  await page.goto("/#settings");
  await expect(page.locator(".family-panel")).toContainText(
    "Sve izmjene su sinhronizovane",
  );
}
async function editWater(page: Page) {
  await page.getByRole("button", { name: "Mjesec", exact: true }).click();
  await page
    .locator(".bill-row")
    .filter({ hasText: "Vodovod i kanalizacija" })
    .click();
}
async function settings(page: Page) {
  await page.getByRole("button", { name: "Postavke", exact: true }).click();
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Sačuvaj izmjene" }).click();
}

test("an authenticated empty household never uploads local demo data", async ({
  page,
}) => {
  const api = backend([]);
  await openFamily(page, api);
  await page.getByRole("button", { name: "Uskladi sada" }).click();
  await expect(page.locator(".family-panel")).toContainText(
    "Sve izmjene su sinhronizovane",
  );
  await page.getByRole("button", { name: "Mjesec", exact: true }).click();
  await expect(page.locator(".bill-row .missing")).toHaveCount(9);
  await expect(page.locator(".bill-row .amount strong").first()).toHaveText(
    "—",
  );
  expect(api.writes).toEqual([]);
  expect(api.rows.size).toBe(0);
});

test("switching to local demo invalidates a delayed family GET and preserves queued edits", async ({
  page,
}) => {
  const api = backend();
  await openFamily(page, api);
  await editWater(page);
  const started = deferred(),
    release = deferred();
  api.holdGet = async () => {
    started.resolve();
    await release.promise;
  };
  await page.getByLabel("Iznos (KM)").fill("37");
  await save(page);
  await started.promise;
  await settings(page);
  await page.getByRole("button", { name: "Otvori lokalni DEMO" }).click();
  release.resolve();
  await expect(page.locator(".family-panel")).toContainText(
    "Lokalna evidencija",
  );
  await page.getByRole("button", { name: "Mjesec", exact: true }).click();
  await expect(
    page.locator(".bill-row").filter({ hasText: "Vodovod" }),
  ).toContainText("DEMO");
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("macaniracuni-family-v1")!).pending[
            "2026-10_s-water"
          ].bill.amount,
      ),
    )
    .toBe(37);
  expect(api.writes).toEqual([]);
  expect(api.rows.get(initial.id)?.bill.amount).toBe(20);
});

test("two devices merge independent fields and require a choice for overlapping amounts", async ({
  page,
  browser,
}) => {
  const api = backend();
  const otherContext = await browser.newContext({ serviceWorkers: "block" });
  const other = await otherContext.newPage();
  await openFamily(page, api);
  await openFamily(other, api);
  await editWater(page);
  await editWater(other);
  await page.getByLabel("Iznos (KM)").fill("30");
  await save(page);
  await expect.poll(() => api.rows.get(initial.id)?.bill.amount).toBe(30);
  await other.getByLabel("Status plaćanja").selectOption("paid");
  await save(other);
  await expect
    .poll(() => api.rows.get(initial.id)?.bill.paymentStatus)
    .toBe("paid");
  expect(api.rows.get(initial.id)?.bill.amount).toBe(30);
  await settings(page);
  await page.getByRole("button", { name: "Uskladi sada" }).click();
  await expect(page.locator(".family-panel")).toContainText(
    "Sve izmjene su sinhronizovane",
  );
  await editWater(page);
  await page.getByLabel("Iznos (KM)").fill("40");
  await save(page);
  await expect.poll(() => api.rows.get(initial.id)?.bill.amount).toBe(40);
  await other.getByLabel("Iznos (KM)").fill("50");
  await save(other);
  await settings(other);
  await expect(other.locator(".family-conflict")).toBeVisible();
  expect(api.rows.get(initial.id)?.bill.amount).toBe(40);
  await other.getByRole("button", { name: "Uzmi porodičnu verziju" }).click();
  await expect(other.locator(".family-conflict")).toHaveCount(0);
  await editWater(other);
  await expect(other.getByLabel("Iznos (KM)")).toHaveValue("40");
  expect(api.rows.get(initial.id)?.bill.paymentStatus).toBe("paid");
  await otherContext.close();
});

test("an edit during a delayed conflicting PUT preserves the remote payment on the next write", async ({
  page,
  browser,
}) => {
  const api = backend();
  const context2 = await browser.newContext({ serviceWorkers: "block" });
  const other = await context2.newPage();
  await openFamily(page, api);
  await openFamily(other, api);
  await editWater(page);
  await editWater(other);
  const started = deferred(),
    release = deferred();
  api.holdPut = async () => {
    started.resolve();
    await release.promise;
  };
  await page.getByLabel("Iznos (KM)").fill("31");
  await save(page);
  await started.promise;
  await other.getByLabel("Status plaćanja").selectOption("paid");
  await save(other);
  await expect
    .poll(() => api.rows.get(initial.id)?.bill.paymentStatus)
    .toBe("paid");
  await page
    .getByLabel("Napomena")
    .fill("Added while the first write was pending");
  await save(page);
  release.resolve();
  await settings(page);
  await expect(page.locator(".family-panel")).toContainText(
    "Sve izmjene su sinhronizovane",
  );
  const saved = api.rows.get(initial.id)!.bill;
  expect(saved).toMatchObject({
    amount: 31,
    paymentStatus: "paid",
    notes: "Added while the first write was pending",
  });
  const cache = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("macaniracuni-family-v1")!),
  );
  expect(cache.pending).toEqual({});
  expect(
    cache.bills.find((b: Bill) => b.id === "2026-10_s-water").paymentStatus,
  ).toBe("paid");
  await context2.close();
});

test("a cached household remains available when session transport fails while navigator reports online", async ({
  page,
}) => {
  const api = backend();
  await openFamily(page, api);
  api.failSession = true;
  await page.reload();
  await expect(page.locator(".family-panel")).toContainText("Rad bez veze");
  await expect(page.locator(".family-panel")).toContainText(
    "member@example.test",
  );
});

test("a delayed PUT cannot restore the family view after switching local", async ({
  page,
}) => {
  const api = backend();
  await openFamily(page, api);
  await editWater(page);
  const started = deferred(),
    release = deferred();
  api.holdPut = async () => {
    started.resolve();
    await release.promise;
  };
  await page.getByLabel("Iznos (KM)").fill("48");
  await save(page);
  await started.promise;
  await settings(page);
  await page.getByRole("button", { name: "Otvori lokalni DEMO" }).click();
  release.resolve();
  await expect(page.locator(".family-panel")).toContainText(
    "Lokalna evidencija",
  );
  await page.getByRole("button", { name: "Mjesec", exact: true }).click();
  await expect(
    page.locator(".bill-row").filter({ hasText: "Vodovod" }),
  ).toContainText("DEMO");
  const cached = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("macaniracuni-family-v1")!),
  );
  expect(cached.pending[initial.id].bill.amount).toBe(48);
  expect(api.writes).toHaveLength(1);
});

test("a complete empty server snapshot removes stale nonpending cached amounts", async ({
  page,
}) => {
  const api = backend();
  await openFamily(page, api);
  api.rows.clear();
  await page.getByRole("button", { name: "Uskladi sada" }).click();
  await expect(page.locator(".family-panel")).toContainText(
    "Sve izmjene su sinhronizovane",
  );
  await editWater(page);
  await expect(page.getByLabel("Iznos (KM)")).toHaveValue("");
  expect(api.writes).toEqual([]);
});

test("malformed cached pending demo records never get uploaded during startup", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const bill = {
      id: "2026-10_s-water",
      templateId: "s-water",
      billingMonth: "2026-10",
      currency: "BAM",
      receiptStatus: "received",
      paymentStatus: "paid",
      amount: 999,
      isDemo: true,
    };
    localStorage.setItem(
      "macaniracuni-family-v1",
      JSON.stringify({
        email: "member@example.test",
        bills: [bill],
        versions: {},
        pending: { [bill.id]: { bill, revision: 0, base: bill } },
        conflicts: {},
      }),
    );
  });
  const api = backend([]);
  await openFamily(page, api);
  await editWater(page);
  await expect(page.getByLabel("Iznos (KM)")).toHaveValue("");
  expect(api.writes).toEqual([]);
});

test("a blocked family cache write reports the failure without presenting demo amounts as family records", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "macaniracuni-family-v1")
        throw new DOMException("quota", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  const api = backend();
  await api.connect(page);
  await page.goto("/#settings");
  await expect(page.locator(".family-panel")).toContainText(
    "Preglednik ne dopušta lokalno čuvanje",
  );
  await expect(page.locator(".family-panel")).not.toContainText(
    "Prijavljen/a kao",
  );
  expect(api.writes).toEqual([]);
});

test("explicitly restored demo data gets a nondemo pending baseline that survives offline reopening", async ({
  page,
}) => {
  const api = backend([]);
  await openFamily(page, api);
  const started = deferred(),
    release = deferred();
  api.holdPut = async () => {
    started.resolve();
    await release.promise;
  };
  const restored = {
    ...initial,
    id: "2026-11_s-water",
    billingMonth: "2026-11",
    amount: 63,
    isDemo: true,
  };
  await page.getByLabel("Datoteka sigurnosne kopije").setInputFiles({
    name: "demo-copy.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ app: "MacaniRacuni", version: 1, bills: [restored] }),
    ),
  });
  await page.getByRole("button", { name: "Zamijeni evidenciju" }).click();
  await started.promise;
  const cached = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("macaniracuni-family-v1")!),
  );
  expect(cached.pending[restored.id].bill.isDemo).toBe(false);
  expect(cached.pending[restored.id].base.isDemo).toBe(false);
  api.failSession = true;
  await page.reload();
  await expect(page.locator(".family-panel")).toContainText("Rad bez veze");
  expect(
    await page.evaluate(() =>
      Object.keys(
        JSON.parse(localStorage.getItem("macaniracuni-family-v1")!).pending,
      ),
    ),
  ).toContain(restored.id);
  release.resolve();
});

test("logout clears the private cache before leaving and signed-out reopening shows local data", async ({
  page,
}) => {
  const api = backend();
  await openFamily(page, api);
  expect(
    await page.evaluate(() => localStorage.getItem("macaniracuni-family-v1")),
  ).not.toBeNull();
  await page.getByRole("button", { name: "Mjesec", exact: true }).click();
  await page.getByRole("button", { name: "Odjava", exact: true }).click();
  await expect(page.locator(".family-panel")).toContainText(
    "Lokalna evidencija",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("macaniracuni-family-v1")),
  ).toBeNull();
  await page.reload();
  await expect(page.locator(".family-panel")).not.toContainText(
    "member@example.test",
  );
  await page.getByRole("button", { name: "Mjesec", exact: true }).click();
  await expect(
    page.locator(".bill-row").filter({ hasText: "Vodovod" }),
  ).toContainText("DEMO");
  expect(api.writes).toEqual([]);
});

test("logout stays disabled while an edit is durably pending", async ({
  page,
}) => {
  const api = backend();
  await openFamily(page, api);
  await editWater(page);
  const started = deferred(),
    release = deferred();
  api.holdGet = async () => {
    started.resolve();
    await release.promise;
  };
  await page.getByLabel("Iznos (KM)").fill("77");
  await save(page);
  await started.promise;
  await settings(page);
  await expect(
    page.getByRole("button", { name: "Odjavi se", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("macaniracuni-family-v1")!).pending[
          "2026-10_s-water"
        ].bill.amount,
    ),
  ).toBe(77);
  release.resolve();
});

test("two same-origin offline tabs retain different bill edits after reopening", async ({
  page,
  context,
}) => {
  const api = backend([
    { bill: initial, revision: 1 },
    {
      bill: {
        ...initial,
        id: "2026-10_s-electric",
        templateId: "s-electric",
        amount: 50,
      },
      revision: 1,
    },
  ]);
  const other = await context.newPage();
  await openFamily(page, api);
  await openFamily(other, api);
  const offline = async (route: Route) => {
    await route.abort("internetdisconnected");
  };
  await page.route("**/api/**", offline);
  await other.route("**/api/**", offline);
  await editWater(page);
  await page.getByLabel("Iznos (KM)").fill("37");
  await save(page);
  await other.getByRole("button", { name: "Mjesec", exact: true }).click();
  await other
    .locator(".bill-row")
    .filter({ hasText: "Električna energija" })
    .filter({ hasText: "Sarajevo" })
    .click();
  await other.getByLabel("Iznos (KM)").fill("81");
  await save(other);
  await page.reload();
  await settings(page);
  await expect(page.locator(".family-panel")).toContainText("Rad bez veze");
  await editWater(page);
  await expect(page.getByLabel("Iznos (KM)")).toHaveValue("37");
  await page.getByRole("button", { name: "Mjesec", exact: true }).click();
  await page
    .locator(".bill-row")
    .filter({ hasText: "Električna energija" })
    .filter({ hasText: "Sarajevo" })
    .click();
  await expect(page.getByLabel("Iznos (KM)")).toHaveValue("81");
  await page.unroute("**/api/**", offline);
  await other.unroute("**/api/**", offline);
  await settings(page);
  await page.getByRole("button", { name: "Uskladi sada" }).click();
  await expect(page.locator(".family-panel")).toContainText(
    "Sve izmjene su sinhronizovane",
  );
  expect(api.rows.get(initial.id)?.bill.amount).toBe(37);
  expect(api.rows.get("2026-10_s-electric")?.bill.amount).toBe(81);
});

test("overlapping offline edits from two same-origin tabs require an explicit choice", async ({
  page,
  context,
}) => {
  const api = backend();
  const other = await context.newPage();
  await openFamily(page, api);
  await openFamily(other, api);
  const offline = async (route: Route) => {
    await route.abort("internetdisconnected");
  };
  await page.route("**/api/**", offline);
  await other.route("**/api/**", offline);
  await editWater(page);
  await editWater(other);
  await page.getByLabel("Iznos (KM)").fill("37");
  await other.getByLabel("Iznos (KM)").fill("49");
  await save(page);
  await other
    .getByLabel("Zadrži moje izmjene preko novijih vrijednosti")
    .check();
  await save(other);
  await settings(page);
  await expect(page.locator(".family-conflict")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        Object.keys(localStorage).filter((k) =>
          k.startsWith("macaniracuni-family-outbox-v1:"),
        ).length,
    ),
  ).toBe(2);
  await page.reload();
  await expect(page.locator(".family-conflict")).toBeVisible();
  await page.getByRole("button", { name: "Zadrži moju izmjenu" }).click();
  await expect(page.locator(".family-conflict")).toHaveCount(0);
  await page.unroute("**/api/**", offline);
  await other.unroute("**/api/**", offline);
  await page.getByRole("button", { name: "Uskladi sada" }).click();
  await expect(page.locator(".family-panel")).toContainText(
    "Sve izmjene su sinhronizovane",
  );
  expect([37, 49]).toContain(api.rows.get(initial.id)?.bill.amount);
});
