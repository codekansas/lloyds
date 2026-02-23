import { expect, test } from "@playwright/test";

test("@smoke health endpoint returns ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as { status?: string };
  expect(payload.status).toBe("ok");
});

test("@smoke status endpoint returns service snapshot", async ({ request }) => {
  const response = await request.get("/api/status");
  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as {
    overallState?: string;
    services?: unknown[];
  };

  expect(payload.overallState).toBeTruthy();
  expect(Array.isArray(payload.services)).toBeTruthy();
});

test("@smoke landing page renders feed", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Lloyd's List", exact: true })).toBeVisible();
});

test("@smoke status page renders", async ({ page }) => {
  await page.goto("/status");

  await expect(page.getByRole("heading", { name: "System Status", exact: true })).toBeVisible();
});

test("@smoke protected routes redirect guests", async ({ page }) => {
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/?\?next=%2Fprofile/);

  await page.goto("/feed/smoke/comments");
  await expect(page).toHaveURL(/\/?\?next=%2Ffeed%2Fsmoke%2Fcomments/);
});
