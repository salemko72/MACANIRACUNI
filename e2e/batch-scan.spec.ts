import { test, expect, type Page } from "@playwright/test";

const suggestion = (templateId = "n-electric", amount = 23.5) => ({
  engine: "ai",
  text: "Synthetic invoice",
  confidence: 0,
  templateId,
  propertyId: templateId.startsWith("n-") ? "nisici" : "sarajevo",
  billingMonth: "2026-09",
  amount,
  dueDate: "2026-10-20",
  warnings: [],
});
async function images(page: Page) {
  return page.evaluate(() =>
    ["FIRST", "SECOND"].map((text) => {
      const c = document.createElement("canvas");
      c.width = 700;
      c.height = 900;
      const x = c.getContext("2d")!;
      x.fillStyle = "white";
      x.fillRect(0, 0, 700, 900);
      x.fillStyle = "black";
      x.font = "35px Arial";
      x.fillText(text, 40, 90);
      return c.toDataURL("image/png").split(",")[1];
    }),
  );
}
async function open(page: Page) {
  await page.route("**/api/session", (route) =>
    route.fulfill({ status: 401, json: { code: "unauthenticated" } }),
  );
  await page.goto("/#scan");
  await page
    .getByRole("button", { name: "Skeniraj sve račune", exact: true })
    .click();
}
async function selectImages(page: Page, duplicate = false) {
  const files = await images(page);
  await page.getByLabel("Odaberi više računa").setInputFiles(
    files.map((data, i) => ({
      name: `invoice-${i}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(duplicate ? files[0] : data, "base64"),
    })),
  );
}
function twoPagePdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>",
    "<< /Length 44 >>\nstream\nBT /F1 24 Tf 60 700 Td (Invoice A) Tj ET\nendstream",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
    "<< /Length 44 >>\nstream\nBT /F1 24 Tf 60 700 Td (Invoice B) Tj ET\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const start = Buffer.byteLength(pdf);
  pdf +=
    `xref\n0 8\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(pdf);
}
test("reopening a partly saved PDF can recover the unsaved page without overwriting the saved one", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/scan", (route) => {
    calls++;
    return route.fulfill({
      json: suggestion(calls % 2 === 1 ? "n-electric" : "s-water"),
    });
  });
  await open(page);
  const pdf = {
    name: "resume.pdf",
    mimeType: "application/pdf",
    buffer: twoPagePdf(),
  };
  await page.getByLabel("Odaberi više računa").setInputFiles(pdf);
  await expect(page.locator(".batch-item-ready")).toHaveCount(2);
  await page
    .locator(".batch-item")
    .nth(1)
    .getByRole("checkbox", { name: "Sačuvaj ovaj račun" })
    .uncheck();
  await page
    .getByRole("button", { name: "Sačuvaj odabrane (1)", exact: true })
    .click();
  await expect(page.locator(".batch-item-saved")).toHaveCount(1);
  await page.reload();
  await page
    .getByRole("button", { name: "Skeniraj sve račune", exact: true })
    .click();
  await page.getByLabel("Odaberi više računa").setInputFiles(pdf);
  await expect(page.locator(".batch-item-ready")).toHaveCount(2);
  await expect(
    page
      .locator(".batch-item")
      .first()
      .getByRole("checkbox", { name: "Sačuvaj ovaj račun" }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Sačuvaj odabrane (1)", exact: true })
    .click();
  await expect(page.locator(".batch-item-saved")).toHaveCount(1);
  expect(calls).toBe(4);
  const ids = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("macaniracuni-demo-v1")!)
      .filter((b: any) =>
        ["2026-09_n-electric", "2026-09_s-water"].includes(b.id),
      )
      .map((b: any) => b.documentId),
  );
  expect(ids[0]).toBeTruthy();
  expect(ids[1]).toBe(ids[0]);
});
test("reads selected images once, reviews them together and saves metadata with local originals", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/scan", (route) =>
    route.fulfill({
      json: suggestion(
        ++calls === 1 ? "n-electric" : "s-water",
        calls === 1 ? 23.5 : 30,
      ),
    }),
  );
  await open(page);
  await selectImages(page);
  await expect(page.locator(".batch-item-ready")).toHaveCount(2);
  expect(calls).toBe(2);
  await page
    .getByRole("button", { name: "Sačuvaj odabrane (2)", exact: true })
    .click();
  await expect(page.locator(".batch-item-saved")).toHaveCount(2);
  const bills = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("macaniracuni-demo-v1")!),
  );
  expect(bills.find((b: any) => b.id === "2026-09_n-electric")).toMatchObject({
    amount: 23.5,
    isDemo: false,
    paymentStatus: "unpaid",
  });
  expect(
    bills.find((b: any) => b.id === "2026-09_s-water").documentId,
  ).toBeTruthy();
});
test("duplicate files are skipped before AI calls and duplicate targets cannot both save", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/scan", (route) => {
    calls++;
    return route.fulfill({ json: suggestion() });
  });
  await open(page);
  await selectImages(page, true);
  await expect(page.locator(".batch-item-duplicate")).toHaveCount(1);
  await expect(page.locator(".batch-item-ready")).toHaveCount(1);
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Odaberi drugu grupu" }).click();
  await selectImages(page);
  await expect(page.locator(".batch-item-ready")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Sačuvaj odabrane (2)", exact: true }),
  ).toBeDisabled();
  await page
    .locator(".batch-item")
    .nth(1)
    .getByRole("checkbox", { name: "Sačuvaj ovaj račun" })
    .uncheck();
  await expect(
    page.getByRole("button", { name: "Sačuvaj odabrane (1)", exact: true }),
  ).toBeEnabled();
});
test("an unsuccessful scan can retry without repeating already successful scans", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/scan", (route) => {
    calls++;
    return route.fulfill(
      calls === 1
        ? { status: 502, json: { code: "ai_unavailable" } }
        : { json: suggestion(calls === 2 ? "s-water" : "n-electric") },
    );
  });
  await open(page);
  await selectImages(page);
  await expect(page.locator(".batch-item-error")).toHaveCount(1);
  await expect(page.locator(".batch-item-ready")).toHaveCount(1);
  await page.getByRole("button", { name: "Pokušaj preostale ponovo" }).click();
  await expect(page.locator(".batch-item-ready")).toHaveCount(2);
  expect(calls).toBe(3);
});
test("PDF pages share one original and a later save failure preserves the first saved attachment", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (
        key === "macaniracuni-demo-v1" &&
        !(window as any).allowSecond &&
        JSON.parse(value).some(
          (b: any) =>
            b.id === "2026-09_s-water" && b.amount === 30 && b.isDemo === false,
        )
      )
        throw new DOMException("Synthetic quota failure", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  let calls = 0;
  await page.route("**/api/scan", (route) =>
    route.fulfill({
      json: suggestion(
        ++calls === 1 ? "n-electric" : "s-water",
        calls === 1 ? 23.5 : 30,
      ),
    }),
  );
  await open(page);
  await page.getByLabel("Odaberi više računa").setInputFiles({
    name: "two-invoices.pdf",
    mimeType: "application/pdf",
    buffer: twoPagePdf(),
  });
  await expect(page.locator(".batch-item-ready")).toHaveCount(2, {
    timeout: 20000,
  });
  expect(calls).toBe(2);
  await page
    .getByRole("button", { name: "Sačuvaj odabrane (2)", exact: true })
    .click();
  await expect(page.locator(".batch-item-saved")).toHaveCount(1);
  const id = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("macaniracuni-demo-v1")!).find(
        (b: any) => b.id === "2026-09_n-electric",
      ).documentId,
  );
  const bytes = await page.evaluate(
    (id) =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open("macaniracuni-documents", 1);
        req.onsuccess = () => {
          const db = req.result;
          const read = db
            .transaction("documents")
            .objectStore("documents")
            .get(id);
          read.onsuccess = () => {
            resolve(read.result?.blob?.size ?? 0);
            db.close();
          };
          read.onerror = reject;
        };
        req.onerror = reject;
      }),
    id,
  );
  expect(bytes).toBeGreaterThan(100);
  await page.evaluate(() => {
    (window as any).allowSecond = true;
  });
  await page
    .getByRole("button", { name: "Sačuvaj odabrane (1)", exact: true })
    .click();
  await expect(page.locator(".batch-item-saved")).toHaveCount(2);
  const secondId = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("macaniracuni-demo-v1")!).find(
        (b: any) => b.id === "2026-09_s-water",
      ).documentId,
  );
  expect(secondId).toBe(id);
});
test("real existing entries need replacement confirmation and keep actual payment status on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await open(page);
  await page.evaluate(() => {
    const key = "macaniracuni-demo-v1",
      rows = JSON.parse(localStorage.getItem(key)!);
    const b = rows.find((b: any) => b.id === "2026-09_n-electric");
    b.isDemo = false;
    b.paymentStatus = "paid";
    localStorage.setItem(key, JSON.stringify(rows));
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Skeniraj sve račune", exact: true })
    .click();
  await page.route("**/api/scan", (route) =>
    route.fulfill({ json: suggestion() }),
  );
  const [first] = await images(page);
  await page.getByLabel("Odaberi više računa").setInputFiles({
    name: "real.png",
    mimeType: "image/png",
    buffer: Buffer.from(first, "base64"),
  });
  await expect(page.locator(".batch-item-ready")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Sačuvaj odabrane (0)", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: /Potvrđujem zamjenu/ }).check();
  await page
    .getByRole("button", { name: "Sačuvaj odabrane (1)", exact: true })
    .click();
  await expect(page.locator(".batch-item-saved")).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("macaniracuni-demo-v1")!).find(
          (b: any) => b.id === "2026-09_n-electric",
        ).paymentStatus,
    ),
  ).toBe("paid");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("stopping a scan keeps pending work and ignores its late response before retry", async ({
  page,
}) => {
  let calls = 0,
    release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/scan", async (route) => {
    calls++;
    if (calls === 1) await hold;
    try {
      await route.fulfill({ json: suggestion() });
    } catch {
      /* The first request is deliberately aborted. */
    }
  });
  await open(page);
  const [first] = await images(page);
  await page.getByLabel("Odaberi više računa").setInputFiles({
    name: "cancel.png",
    mimeType: "image/png",
    buffer: Buffer.from(first, "base64"),
  });
  await expect.poll(() => calls).toBe(1);
  await page.getByRole("button", { name: "Zaustavi čitanje" }).click();
  await expect(page.locator(".batch-item-pending")).toHaveCount(1);
  release();
  await expect(page.locator(".batch-item-ready")).toHaveCount(0);
  await page.getByRole("button", { name: "Pokušaj preostale ponovo" }).click();
  await expect(page.locator(".batch-item-ready")).toHaveCount(1);
  expect(calls).toBe(2);
});

test("daily quota pauses the remaining files instead of repeatedly sending them", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/scan", (route) => {
    calls++;
    return route.fulfill(
      calls === 1
        ? { status: 429, json: { code: "daily_scan_limit" } }
        : { json: suggestion(calls === 2 ? "n-electric" : "s-water") },
    );
  });
  await open(page);
  await selectImages(page);
  await expect(page.locator(".batch-item-error")).toHaveCount(1);
  await expect(page.locator(".batch-item-pending")).toHaveCount(1);
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Pokušaj preostale ponovo" }).click();
  await expect(page.locator(".batch-item-ready")).toHaveCount(2);
  expect(calls).toBe(3);
});
