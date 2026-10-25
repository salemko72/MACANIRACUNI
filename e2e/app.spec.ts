import { test, expect } from "@playwright/test";
test("mobilni tok, statusi, čuvanje, filter i novi mjesec", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".bill-row")).toHaveCount(9);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Nišići", exact: true }).click();
  await expect(page.locator(".bill-row")).toHaveCount(3);
  await page.locator(".bill-row").first().click();
  await page
    .getByRole("button", { name: "Označi kao primljen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Označi kao plaćen", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Iznos (KM)").fill("45.67");
  await page.getByRole("button", { name: "Sačuvaj izmjene" }).click();
  await page.reload();
  await expect(page.getByLabel("Iznos (KM)")).toHaveValue("45.67");
  await expect(
    page.getByRole("button", { name: "Primljen · poništi" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pregled mjeseca" }).click();
  await page.getByRole("button", { name: "Sve", exact: true }).click();
  await page.getByRole("button", { name: "Naredni mjesec" }).click();
  await expect(page.locator(".bill-row")).toHaveCount(9);
  await expect(page.locator(".bill-row .missing")).toHaveCount(9);
  await expect(page.locator(".bill-row .unpaid")).toHaveCount(9);
  await page.screenshot({ path: "artifacts/mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Statistika", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mjesečni pregled" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skeniraj", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Račun na dohvat ruke." }),
  ).toBeVisible();
});
test("desktop pregled bez horizontalnog preljeva", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator(".bill-row")).toHaveCount(9);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1440);
  await page.screenshot({ path: "artifacts/desktop.png", fullPage: true });
});

test("statistika bira mjesec i nekretninu", async ({ page }) => {
  await page.goto("/#stats");
  await page.getByRole("button", { name: "Nišići", exact: true }).click();
  await expect(page.locator(".supplier-trend")).toHaveCount(3);
  await page.getByLabel("Obračunski mjesec").fill("2026-09");
  await expect(page.locator(".stats")).toContainText("septembar 2026");
  await expect(page.locator(".stats .stat-total")).toContainText("54,20 KM");
});
test("kopija traži pregled prije zamjene i odbija neispravnu datoteku", async ({
  page,
}) => {
  await page.goto("/#settings");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Preuzmi sigurnosnu kopiju" }).click();
  expect((await download).suggestedFilename()).toMatch(/MacaniRacuni-DEMO/);
  const file = page.getByLabel("Datoteka sigurnosne kopije");
  await file.setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"bad":true}'),
  });
  await expect(page.getByRole("alert")).toContainText("Uvoz nije izvršen");
  const bills = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("macaniracuni-demo-v1")!),
  );
  bills[0].amount = 123.45;
  await file.setInputFiles({
    name: "copy.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ app: "MacaniRacuni", version: 1, bills }),
    ),
  });
  await expect(
    page.getByRole("heading", { name: "Pregled kopije" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("macaniracuni-demo-v1")!)[0].amount,
    ),
  ).not.toBe(123.45);
  await page.getByRole("button", { name: "Zamijeni evidenciju" }).click();
  await page.reload();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("macaniracuni-demo-v1")!)[0].amount,
    ),
  ).toBe(123.45);
});

test("obračunski mjesec ostaje septembar uz prijem u oktobru", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Obračunski mjesec").fill("2026-09");
  await page.locator(".bill-row").first().click();
  await page.getByLabel("Datum prijema").fill("2026-10-12");
  await page.getByRole("button", { name: "Sačuvaj izmjene" }).click();
  await page.reload();
  await expect(page.getByLabel("Datum prijema")).toHaveValue("2026-10-12");
  await expect(page.locator(".detail")).toContainText("septembar 2026");
});
test("produkcijska PWA se ponovo otvara bez mreže", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
    return !!r.active;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".bill-row")).toHaveCount(9);
  await page.getByRole("button", { name: "Statistika", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mjesečni pregled" }),
  ).toBeVisible();
});

test("postojeća evidencija dobija Sarajevostan i vodu Nišići bez gubitka podataka", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const key = "macaniracuni-demo-v1";
    const old = JSON.parse(localStorage.getItem(key)!).filter(
      (b: { templateId: string }) =>
        !["s-maintenance", "n-water"].includes(b.templateId),
    );
    old[0].amount = 777.12;
    old[0].notes = "Sačuvana historija";
    localStorage.setItem(key, JSON.stringify(old));
  });
  await page.reload();
  await expect(page.locator(".bill-row")).toHaveCount(9);
  await expect(
    page.getByRole("button", { name: /Sarajevostan/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nišići", exact: true }).click();
  await expect(page.locator(".bill-row")).toHaveCount(3);
  await expect(
    page.locator(".bill-row").filter({ hasText: "Voda" }),
  ).toContainText("Nedostaje");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("macaniracuni-demo-v1")!),
  );
  expect(saved).toHaveLength(27);
  expect(saved[0].amount).toBe(777.12);
  expect(saved[0].notes).toBe("Sačuvana historija");
  await page.reload();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("macaniracuni-demo-v1")!).length,
    ),
  ).toBe(27);
});

test("svih devet računa stane iznad navigacije na iPhone ekranu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".bill-row")).toHaveCount(9);
  await page.evaluate(() => document.fonts.ready);
  const last = await page.locator(".bill-row").last().boundingBox();
  const nav = await page.locator("aside").boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(nav!.y);
  await page.screenshot({
    path: "artifacts/mobile-compact.png",
    fullPage: true,
  });
});
