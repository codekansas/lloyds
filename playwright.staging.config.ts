import { defineConfig, devices } from "@playwright/test";

const baseUrl = process.env.STAGING_BASE_URL;

if (!baseUrl) {
  throw new Error("Missing STAGING_BASE_URL for staging smoke/acceptance tests.");
}

export default defineConfig({
  testDir: "./e2e/staging",
  fullyParallel: true,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: baseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
