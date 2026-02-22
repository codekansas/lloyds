import { expect, test } from "./fixtures";
import { loginAsUser } from "./helpers/auth";
import { prismaClient } from "./helpers/db";

test("redirects guests away from protected routes", async ({ page }) => {
  await page.goto("/feed");

  await expect(page).toHaveURL(/\/?\?next=%2Ffeed/);
  await expect(page.getByRole("heading", { name: "Lloyd's Coffee House" })).toBeVisible();
  await expect(page.getByText("Sign in with a standard provider.")).toBeVisible();
});

test("requires covenant acceptance before feed access", async ({ page, baseURL }) => {
  if (!baseURL) {
    throw new Error("baseURL is not configured for Playwright.");
  }

  const { user } = await loginAsUser(page.context(), {
    baseUrl: baseURL,
    manifestoAccepted: false,
    name: "Unaccepted User",
  });

  await page.goto("/feed");
  await expect(page).toHaveURL(/\/manifesto/);
  await expect(page.getByRole("heading", { name: "Covenant of Entry" })).toBeVisible();

  const checkboxes = page.locator(".manifesto-tenets input[type='checkbox']");
  const checkboxCount = await checkboxes.count();

  for (let idx = 0; idx < checkboxCount; idx += 1) {
    await checkboxes.nth(idx).check();
  }

  await page.getByRole("button", { name: "Agree and Enter" }).click();
  await expect(page).toHaveURL(/\/feed/);

  const updatedUser = await prismaClient.user.findUniqueOrThrow({
    where: {
      id: user.id,
    },
  });

  expect(updatedUser.manifestoAcceptedAt).not.toBeNull();
});
