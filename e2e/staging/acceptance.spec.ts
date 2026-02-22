import { expect, test } from "@playwright/test";

test("@acceptance cron routes reject unauthorized callers", async ({ request }) => {
  const summarize = await request.get("/api/jobs/summarize");
  expect(summarize.status()).toBe(401);

  const ingest = await request.get("/api/jobs/ingest-rss");
  expect(ingest.status()).toBe(401);

  const match = await request.get("/api/jobs/match-users");
  expect(match.status()).toBe(401);
});

test("@acceptance protected profile and matching routes stay gated", async ({ page }) => {
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/?\?next=%2Fprofile/);

  await page.goto("/matching");
  await expect(page).toHaveURL(/\/?\?next=%2Fmatching/);
});
