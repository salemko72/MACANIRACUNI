import { defineConfig } from "@playwright/test";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173";
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL, channel: "msedge" },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run preview",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: true,
      },
});
