import { test, expect } from "@playwright/test";

test("Mistral status is green only after the server confirms a working model", async ({
  page,
}) => {
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({
      json: {
        active: true,
        checkedAt: "2026-10-26T15:00:00Z",
        model: "Mistral Vision",
      },
    }),
  );
  await page.goto("/#month");
  await expect(page.getByLabel("Stanje veze s Mistralom")).toHaveText(
    "● Veza sa Mistralom aktivna",
  );
});
test("a missing session is shown instead of a false active AI connection", async ({
  page,
}) => {
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({ status: 401, json: { code: "unauthenticated" } }),
  );
  await page.goto("/#month");
  await expect(page.getByLabel("Stanje veze s Mistralom")).toContainText(
    "potrebna prijava",
  );
});
test("provider errors never show an active AI connection", async ({ page }) => {
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({ status: 502, json: { active: false } }),
  );
  await page.goto("/#month");
  await expect(page.getByLabel("Stanje veze s Mistralom")).toContainText(
    "veza nije potvrđena",
  );
});
