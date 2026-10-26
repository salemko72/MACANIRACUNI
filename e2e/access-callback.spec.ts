import { test, expect } from "@playwright/test";

test("installed PWA lets the Access callback reach the network instead of opening the cached SPA", async ({
  page,
}) => {
  await page.goto("/#month");
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
  await page.route("**/cdn-cgi/access/authorized?test=1", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Authentication callback reached network</h1>",
    }),
  );
  await page.goto("/cdn-cgi/access/authorized?test=1");
  await expect(
    page.getByRole("heading", {
      name: "Authentication callback reached network",
    }),
  ).toBeVisible();
});
