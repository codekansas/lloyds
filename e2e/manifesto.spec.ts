import { expect, test } from "./fixtures";
import { loginAsUser } from "./helpers/auth";
import { prismaClient } from "./helpers/db";

test("redirects guests away from protected routes", async ({ page }) => {
  await page.goto("/profile");

  await expect(page).toHaveURL(/\/?\?next=%2Fprofile/);
  await expect(page.getByRole("heading", { name: "Lloyd's List", exact: true })).toBeVisible();
  await expect(page.getByText("Guests can read the feed. Sign in to comment and join discussion.")).toBeVisible();

  await page.goto("/feed/test/comments");
  await expect(page).toHaveURL(/\/?\?next=%2Ffeed%2Ftest%2Fcomments/);
});

test("requires covenant acceptance before protected actions", async ({ page, baseURL }) => {
  if (!baseURL) {
    throw new Error("baseURL is not configured for Playwright.");
  }

  const { user } = await loginAsUser(page.context(), {
    baseUrl: baseURL,
    manifestoAccepted: false,
    name: "Unaccepted User",
  });

  await page.goto("/profile");
  await expect(page).toHaveURL(/\/manifesto/);
  await expect(page.getByRole("heading", { level: 2, name: /covenant/i })).toBeVisible();

  const checkboxes = page.locator(".manifesto-tenets input[type='checkbox']");
  const checkboxCount = await checkboxes.count();

  for (let idx = 0; idx < checkboxCount; idx += 1) {
    await checkboxes.nth(idx).check();
  }

  await page.getByRole("button", { name: "Agree and Enter" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/profile/);

  const updatedUser = await prismaClient.user.findUniqueOrThrow({
    where: {
      id: user.id,
    },
  });

  expect(updatedUser.manifestoAcceptedAt).not.toBeNull();
});
