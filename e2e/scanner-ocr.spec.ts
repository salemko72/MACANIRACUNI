import { test, expect } from "@playwright/test";

test("real camera image OCR saves a local original and keeps paid status across reload", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/#scan");
  await page.evaluate(() => {
    const key = "macaniracuni-demo-v1";
    const bills = JSON.parse(localStorage.getItem(key)!);
    const actual = bills.find(
      (b: { id: string }) => b.id === "2026-09_n-electric",
    );
    actual.isDemo = false;
    actual.paymentStatus = "paid";
    localStorage.setItem(key, JSON.stringify(bills));
  });
  await page.reload();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1500;
    canvas.height = 1000;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 1500, 1000);
    ctx.fillStyle = "black";
    ctx.font = "38px Arial";
    [
      "JP Elektroprivreda BiH",
      "Mjesto potrosnje: Nisici",
      "Obracunski period: 09/2026",
      "Datum izdavanja: 03.10.2026",
      "Rok placanja: 20.10.2026",
      "Prethodni dug: 900,00 KM",
      "UKUPNO ZA UPLATU: 123,45 BAM",
    ].forEach((line, i) => ctx.fillText(line, 60, 100 + i * 95));
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByLabel("Priloži sliku ili PDF", { exact: true })
    .setInputFiles({
      name: "synthetic-electricity.png",
      mimeType: "image/png",
      buffer: Buffer.from(image, "base64"),
    });
  await expect(
    page.getByRole("heading", { name: "Električna energija", exact: true }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".scan-amount")).toContainText("123,45");
  await page.getByText("Provjeri ili izmijeni podatke").click();
  await expect(
    page.getByRole("combobox", { name: "Objekat", exact: true }),
  ).toHaveValue("nisici");
  await expect(
    page.getByLabel("Obračunski mjesec", { exact: true }),
  ).toHaveValue("2026-09");
  await expect(page.getByLabel("Rok plaćanja", { exact: true })).toHaveValue(
    "2026-10-20",
  );
  const confirm = page.getByRole("checkbox", { name: /Potvrđujem zamjenu/ });
  if (await confirm.count()) await confirm.check();
  await page.getByRole("button", { name: "Potvrdi i sačuvaj" }).click();
  await expect(page.locator(".scanner")).toHaveCount(0);
  await page.goto("/#bill/2026-09_n-electric");
  await expect(
    page.getByRole("link", { name: "Otvori original", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".scan-original-image")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Otvori original", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Status plaćanja", exact: true }),
  ).toHaveValue("paid");
  const savedOriginal = await page
    .locator(".scan-original-image")
    .evaluate(async (img) => {
      const response = await fetch((img as HTMLImageElement).src);
      return (await response.blob()).size;
    });
  expect(savedOriginal).toBeGreaterThan(1000);
  const second = await page.evaluate(async (image) => {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = "data:image/png;base64," + image;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1500;
    canvas.height = 1000;
    const c = canvas.getContext("2d")!;
    c.drawImage(img, 0, 0);
    c.fillStyle = "#fff";
    c.fillRect(1490, 990, 10, 10);
    c.fillStyle = "#000";
    c.fillRect(1498, 998, 1, 1);
    return canvas.toDataURL("image/png").split(",")[1];
  }, image);
  await page.context().setOffline(true);
  await page.goto("/#scan");
  await page
    .getByLabel("Priloži sliku ili PDF", { exact: true })
    .setInputFiles({
      name: "offline-synthetic.png",
      mimeType: "image/png",
      buffer: Buffer.from(second, "base64"),
    });
  await expect(
    page.getByRole("heading", { name: "Električna energija", exact: true }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".scan-amount")).toContainText("123,45");
  await page.context().setOffline(false);
  await page.screenshot({
    path: "C:/MacaniRacuni/test-results/scanner-saved-original.png",
    fullPage: true,
  });
});
