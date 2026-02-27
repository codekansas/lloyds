import { expect, test } from "@playwright/test";

import { gotoWithoutServerError } from "./navigation";

test("@acceptance cron routes reject unauthorized callers", async ({ request }) => {
  const summarize = await request.get("/api/jobs/summarize");
  expect(summarize.status()).toBe(401);

  const ingest = await request.get("/api/jobs/ingest-rss");
  expect(ingest.status()).toBe(401);
});

test("@acceptance protected profile and comment routes stay gated", async ({ page }) => {
  test.setTimeout(180_000);
  await gotoWithoutServerError(page, "/profile");
  await expect(page).toHaveURL(/\/?\?next=%2Fprofile/);

  await gotoWithoutServerError(page, "/feed/staging/comments");
  await expect(page).toHaveURL(/\/?\?next=%2Ffeed%2Fstaging%2Fcomments/);
});
