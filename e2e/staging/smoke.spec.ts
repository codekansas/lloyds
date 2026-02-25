import { expect, test } from "@playwright/test";

test("@smoke health endpoint returns ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as { status?: string };
  expect(payload.status).toBe("ok");
});

test("@smoke readiness endpoint reports healthy dependencies", async ({ request }) => {
  const response = await request.get("/api/health?mode=readiness");
  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as {
    status?: string;
    mode?: string;
    appEnv?: string;
    blockingServices?: unknown[];
  };
  expect(payload.status).toBe("ok");
  if (payload.mode !== undefined) {
    expect(payload.mode).toBe("readiness");
  }
  if (payload.appEnv !== undefined) {
    expect(payload.appEnv).toBe("staging");
  }
  if (payload.blockingServices !== undefined) {
    expect(Array.isArray(payload.blockingServices)).toBeTruthy();
  }
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

test("@smoke auth providers endpoint returns configured providers", async ({ request }) => {
  const response = await request.get("/api/auth/providers");
  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as Record<
    string,
    {
      id?: string;
      signinUrl?: string;
      callbackUrl?: string;
    }
  >;

  const providerEntries = Object.entries(payload);
  expect(providerEntries.length).toBeGreaterThan(0);

  for (const [providerKey, provider] of providerEntries) {
    expect(provider.id).toBe(providerKey);
    expect(provider.signinUrl).toContain(`/api/auth/signin/${providerKey}`);
    expect(provider.callbackUrl).toContain(`/api/auth/callback/${providerKey}`);
  }
});

test("@smoke auth session endpoint responds without adapter errors", async ({ request }) => {
  const response = await request.get("/api/auth/session");
  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as unknown;
  expect(payload === null || typeof payload === "object").toBeTruthy();
});

test("@smoke auth sign-in page renders without server configuration error", async ({ page }) => {
  await page.goto("/api/auth/signin");

  await expect(page.locator("body")).toContainText("Sign in");
  await expect(page.locator("body")).not.toContainText("There is a problem with the server configuration.");

  const providerButtons = page.locator('form[action*="/api/auth/signin/"] button');
  await expect(providerButtons.first()).toBeVisible();
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
