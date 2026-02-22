import { expect, test } from "@playwright/test";

test("@smoke health endpoint returns ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as { status?: string };
  expect(payload.status).toBe("ok");
});

test("@smoke landing page renders entry point", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Lloyd's Coffee House", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enter the House" })).toBeVisible();
});

test("@smoke protected routes redirect guests", async ({ page }) => {
  await page.goto("/feed");

  await expect(page).toHaveURL(/\/?\?next=%2Ffeed/);
  await expect(page.getByText("Sign in with a standard provider.")).toBeVisible();
});
