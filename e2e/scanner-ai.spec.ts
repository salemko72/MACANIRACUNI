import { test, expect } from "@playwright/test";

async function photo(page: import("@playwright/test").Page) {
  const image = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 1000;
    const x = c.getContext("2d")!;
    x.fillStyle = "white";
    x.fillRect(0, 0, 800, 1000);
    x.fillStyle = "black";
    x.font = "40px Arial";
    x.fillText("Synthetic invoice", 50, 100);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByLabel("Priloži sliku ili PDF", { exact: true })
    .setInputFiles({
      name: "ai-test.png",
      mimeType: "image/png",
      buffer: Buffer.from(image, "base64"),
    });
}
test("AI is the default reader and fills the invoice for confirmation", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/scan", async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    expect(body.image).toMatch(/^data:image\/jpeg;base64,/);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        engine: "ai",
        text: "Synthetic invoice",
        confidence: 0,
        templateId: "s-water",
        propertyId: "sarajevo",
        billingMonth: "2026-09",
        amount: 42.85,
        dueDate: "2026-10-20",
        warnings: [],
      }),
    });
  });
  await page.goto("/#scan");
  await expect(
    page.getByRole("checkbox", { name: "Čitaj na uređaju bez AI-a" }),
  ).not.toBeChecked();
  await photo(page);
  await expect(page.getByText("Pročitano AI čitačem")).toBeVisible();
  await expect(page.locator(".scan-amount")).toContainText("42,85");
  expect(calls).toBe(1);
  await expect(
    page.getByRole("button", { name: "Potvrdi i sačuvaj" }),
  ).toBeEnabled();
});
test("missing login offers a direct return to scanning without pretending local OCR was AI", async ({
  page,
}) => {
  await page.route("**/api/scan", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: '{"code":"unauthenticated"}',
    }),
  );
  await page.goto("/#scan");
  await photo(page);
  await expect(page.getByRole("alert")).toContainText("prijavi");
  await expect(
    page.getByRole("link", { name: "Prijavi se za AI čitanje →" }),
  ).toHaveAttribute("href", "/api/login?next=scan");
  await expect(
    page.getByRole("button", { name: "Potvrdi i sačuvaj" }),
  ).toHaveCount(0);
});
test("daily AI limit has an actionable message and keeps local reading available", async ({
  page,
}) => {
  await page.route("**/api/scan", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: '{"code":"daily_scan_limit"}',
    }),
  );
  await page.goto("/#scan");
  await photo(page);
  await expect(page.getByRole("alert")).toContainText("limit");
  await page
    .getByRole("checkbox", { name: "Čitaj na uređaju bez AI-a" })
    .check();
  await expect(
    page.getByText("Čitanje na uređaju", { exact: true }),
  ).toBeVisible();
});
