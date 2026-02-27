import { expect, test } from "@playwright/test";

import { gotoWithoutServerError } from "./navigation";

test("@smoke health endpoint returns ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as { status?: string };
  expect(payload.status).toBe("ok");
});

test("@smoke readiness endpoint returns dependency status payload", async ({ request }) => {
  const response = await request.get("/api/health?mode=readiness");
  expect([200, 503]).toContain(response.status());

  const payload = (await response.json()) as {
    status?: "ok" | "error";
    mode?: string;
    appEnv?: string;
    blockingServices?: Array<{
      id?: string;
      state?: string;
      summary?: string;
    }>;
  };
  expect(payload.mode).toBe("readiness");
  if (payload.appEnv !== undefined) {
    expect(payload.appEnv).toBe("staging");
  }

  const blockingServices = payload.blockingServices ?? [];
  expect(Array.isArray(blockingServices)).toBeTruthy();

  if (payload.status === "ok") {
    expect(response.status()).toBe(200);
  } else {
    expect(payload.status).toBe("error");
    expect(response.status()).toBe(503);
    expect(blockingServices.length).toBeGreaterThan(0);
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
  test.setTimeout(180_000);
  await gotoWithoutServerError(page, "/");

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
  test.setTimeout(180_000);
  await gotoWithoutServerError(page, "/api/auth/signin");

  await expect(page.locator("body")).toContainText("Sign in");
  await expect(page.locator("body")).not.toContainText("There is a problem with the server configuration.");

  const providerButtons = page.locator('form[action*="/api/auth/signin/"] button');
  await expect(providerButtons.first()).toBeVisible();
});

test("@smoke status page renders", async ({ page }) => {
  test.setTimeout(180_000);
  await gotoWithoutServerError(page, "/status");

  await expect(page.getByRole("heading", { name: "System Status", exact: true })).toBeVisible();
});

test("@smoke protected routes redirect guests", async ({ page }) => {
  test.setTimeout(180_000);
  await gotoWithoutServerError(page, "/profile");
  await expect(page).toHaveURL(/\/?\?next=%2Fprofile/);

  await gotoWithoutServerError(page, "/feed/smoke/comments");
  await expect(page).toHaveURL(/\/?\?next=%2Ffeed%2Fsmoke%2Fcomments/);
});
