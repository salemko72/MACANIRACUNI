import { test, expect } from "@playwright/test";

test("loaded build date remains visible across screens", async ({ page }) => {
  await page.goto("/#month");
  const label = page.getByLabel("Učitana verzija aplikacije");
  await expect(label).toContainText(/Verzija:.*\d{2}:\d{2}/);
  const loaded = await label.textContent();
  await page.goto("/#scan");
  await expect(label).toHaveText(loaded!);
});
test("a newer deployed build offers refresh and never claims the old page is current", async ({
  page,
}) => {
  await page.route("**/version.json*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "2099-01-01T00:00:00.000Z",
        builtAt: "2099-01-01T00:00:00.000Z",
      }),
    }),
  );
  await page.goto("/#month");
  await expect(
    page.getByRole("button", { name: "Dostupna novija verzija — osvježi" }),
  ).toBeVisible();
});
