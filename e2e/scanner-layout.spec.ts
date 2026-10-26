import { test, expect } from "@playwright/test";

test("reads a tilted invoice table with currency in a header and multiline dates", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/#scan");
  const image = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1800;
    c.height = 2400;
    const x = c.getContext("2d")!;
    x.fillStyle = "#eeeeeb";
    x.fillRect(0, 0, c.width, c.height);
    x.translate(900, 1200);
    x.rotate((3 * Math.PI) / 180);
    x.translate(-900, -1200);
    x.fillStyle = "#fff";
    x.fillRect(160, 130, 1480, 2100);
    x.fillStyle = "#222";
    x.font = "30px Arial";
    [
      "JP Elektroprivreda BiH",
      "Mjesto potrosnje: Nisici",
      "Obracunski period",
      "09 / 2026",
      "Rok placanja",
      "20. 10. 2026.",
    ].forEach((s, i) => x.fillText(s, 220, 250 + i * 100));
    x.strokeStyle = "#444";
    for (let i = 0; i < 8; i++) {
      x.strokeRect(210, 1000 + i * 90, 1380, 90);
      x.fillText("Obracunska stavka " + (i + 1), 235, 1060 + i * 90);
      x.fillText("12,34", 1400, 1060 + i * 90);
    }
    x.fillText("UKUPNO ZA UPLATU (KM)", 220, 1950);
    x.fillText("123,45", 1300, 2070);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByLabel("Priloži sliku ili PDF", { exact: true })
    .setInputFiles({
      name: "synthetic-layout.png",
      mimeType: "image/png",
      buffer: Buffer.from(image, "base64"),
    });
  await expect(
    page.getByRole("heading", { name: "Električna energija", exact: true }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".scan-amount")).toContainText("123,45");
  const details = page.locator("details.scan-details");
  if (!(await details.getAttribute("open")))
    await details.locator("summary").first().click();
  await expect(
    page.getByLabel("Obračunski mjesec", { exact: true }),
  ).toHaveValue("2026-09");
  await expect(page.getByLabel("Rok plaćanja", { exact: true })).toHaveValue(
    "2026-10-20",
  );
  await expect(
    page.getByRole("combobox", { name: "Objekat", exact: true }),
  ).toHaveValue("nisici");
});
