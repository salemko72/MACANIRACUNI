import { defineConfig } from "@playwright/test";
const remote = process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: remote || "http://127.0.0.1:4173", channel: "msedge" },
  webServer: remote
    ? undefined
    : [
        {
          command: "npm run preview",
          url: "http://127.0.0.1:4173",
          reuseExistingServer: true,
        },
        {
          command: "npm run dev -- --port 5175",
          url: "http://127.0.0.1:5175",
          reuseExistingServer: true,
        },
      ],
});
