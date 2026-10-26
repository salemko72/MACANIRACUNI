import { test, expect, type Page } from "@playwright/test";
import type { Bill } from "../src/domain";

type Version = { bill: Bill; revision: number };
const id = "2026-10_s-water";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function backend(sessionGate?: Promise<void>) {
  let record: Version = {
    bill: {
      id,
      templateId: "s-water",
      billingMonth: "2026-10",
      currency: "BAM",
      receiptStatus: "missing",
      paymentStatus: "unpaid",
      amount: 20,
      isDemo: false,
    },
    revision: 1,
  };
  const writes: Version[] = [];
  return {
    writes,
    get record() {
      return record;
    },
    remote(patch: Partial<Bill>) {
      record = {
        bill: { ...record.bill, ...patch },
        revision: record.revision + 1,
      };
    },
    async connect(page: Page) {
      await page.route("**/api/**", async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path === "/api/session") {
          await sessionGate;
          return route.fulfill({ json: { email: "member@example.test" } });
        }
        if (request.method() === "GET" && path === "/api/bills")
          return route.fulfill({ json: { bills: [structuredClone(record)] } });
        if (request.method() === "PUT" && path === `/api/bills/${id}`) {
          const data = request.postDataJSON() as Version;
          writes.push(structuredClone(data));
          if (data.revision !== record.revision)
            return route.fulfill({ status: 409, json: { current: record } });
          record = { bill: data.bill, revision: record.revision + 1 };
          return route.fulfill({ json: record });
        }
        return route.fulfill({ status: 404, json: { code: "not_found" } });
      });
    },
  };
}
async function waitRevision(page: Page, revision: number) {
  await expect
    .poll(() =>
      page.evaluate((billId) => {
        const cache = JSON.parse(
          localStorage.getItem("macaniracuni-family-v1") || "null",
        );
        return cache?.versions?.[billId]?.revision;
      }, id),
    )
    .toBe(revision);
}
async function refresh(page: Page, revision: number) {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await waitRevision(page, revision);
}
async function open(page: Page, api: ReturnType<typeof backend>) {
  await api.connect(page);
  await page.goto(`/#bill/${id}`);
  await waitRevision(page, 1);
}

test("delayed family activation never copies local demo dates or notes on quick save", async ({
  page,
}) => {
  const gate = deferred();
  const api = backend(gate.promise);
  await api.connect(page);
  await page.goto(`/#bill/${id}`);
  await expect(page.locator("textarea[name=notes]")).toContainText("DEMO");
  await expect(page.locator("input[name=dueDate]")).toHaveValue("2026-10-28");
  gate.resolve();
  await waitRevision(page, 1);
  await page.getByRole("button", { name: "Označi kao plaćen" }).click();
  await expect.poll(() => api.writes.length).toBe(1);
  expect(api.writes[0].bill.amount).toBe(20);
  expect(api.writes[0].bill.notes ?? "").toBe("");
  expect(api.writes[0].bill.dueDate).toBeUndefined();
  expect(api.writes[0].bill.issueDate).toBeUndefined();
  expect(api.writes[0].bill.receivedAt).toBeUndefined();
  expect(api.writes[0].bill.receiptStatus).toBe("missing");
  expect(api.writes[0].bill.paymentStatus).toBe("paid");
});

test("remote amount replaces a previously saved clean value before quick payment", async ({
  page,
}) => {
  const api = backend();
  await open(page, api);
  await page.locator("input[name=amount]").fill("10");
  await page.getByRole("button", { name: "Sačuvaj izmjene" }).click();
  await waitRevision(page, 2);
  api.remote({ amount: 30 });
  await refresh(page, 3);
  await expect(page.locator("input[name=amount]")).toHaveValue("30");
  await page.getByRole("button", { name: "Označi kao plaćen" }).click();
  await waitRevision(page, 4);
  expect(api.writes.at(-1)?.bill.amount).toBe(30);
  expect(api.writes.at(-1)?.bill.paymentStatus).toBe("paid");
});

test("overlapping unsaved amount requires explicit overwrite or loading the newer value", async ({
  page,
}) => {
  const api = backend();
  await open(page, api);
  await page.locator("input[name=amount]").fill("10");
  api.remote({ amount: 30 });
  await refresh(page, 2);
  await expect(
    page.getByText("Podaci su promijenjeni na drugom uređaju", {
      exact: false,
    }),
  ).toBeVisible();
  const confirmation = page.getByRole("checkbox", {
    name: "Zadrži moje izmjene preko novijih vrijednosti",
  });
  await expect(confirmation).not.toBeChecked();
  const save = page.getByRole("button", { name: "Sačuvaj izmjene" });
  if (await save.isEnabled()) await save.click();
  expect(api.writes).toHaveLength(0);
  await confirmation.check();
  await save.click();
  await waitRevision(page, 3);
  expect(api.writes[0].bill.amount).toBe(10);
  expect(api.writes[0].revision).toBe(2);

  await page.locator("input[name=amount]").fill("15");
  api.remote({ amount: 40 });
  await refresh(page, 4);
  await page.getByRole("button", { name: "Učitaj novije vrijednosti" }).click();
  await expect(page.locator("input[name=amount]")).toHaveValue("40");
  await page.getByRole("button", { name: "Označi kao plaćen" }).click();
  await waitRevision(page, 5);
  expect(api.writes.at(-1)?.bill.amount).toBe(40);
  expect(api.writes.at(-1)?.bill.paymentStatus).toBe("paid");
});
