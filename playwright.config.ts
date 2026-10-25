import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const accessPassword =
  process.env.XPAT_ACCESS_PASSWORD ?? "xpat-e2e-access-password";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start -- --port 3100",
        reuseExistingServer: true,
        timeout: 180_000,
        url: baseURL,
        env: { ...process.env, XPAT_ACCESS_PASSWORD: accessPassword },
      },
});
