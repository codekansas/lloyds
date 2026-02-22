import { defineConfig, devices } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3001";
const cronSecret = process.env.CRON_SECRET ?? "e2e-cron-secret";
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/lloyds_e2e?schema=public";

process.env.PLAYWRIGHT_BASE_URL = baseUrl;
process.env.CRON_SECRET = cronSecret;
process.env.DATABASE_URL = databaseUrl;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/staging/**"],
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 12_000,
  },
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: baseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
  },
  webServer: {
    command: "npm run dev -- --port 3001",
    url: `${baseUrl}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-auth-secret-please-change",
      AUTH_TRUST_HOST: "true",
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "e2e-google-client-id",
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "e2e-google-client-secret",
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ?? "e2e-github-client-id",
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ?? "e2e-github-client-secret",
      CRON_SECRET: cronSecret,
      E2E_TEST_MODE: "true",
      PLAYWRIGHT_BASE_URL: baseUrl,
    },
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
