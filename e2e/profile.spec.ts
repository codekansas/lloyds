import { expect, test } from "./fixtures";
import { loginAsUser } from "./helpers/auth";
import { prismaClient } from "./helpers/db";

test("updates profile details", async ({ page, baseURL }) => {
  if (!baseURL) {
    throw new Error("baseURL is not configured for Playwright.");
  }

  const { user } = await loginAsUser(page.context(), {
    baseUrl: baseURL,
    manifestoAccepted: true,
    name: "Profile User",
  });

  await page.goto("/profile");

  await page.locator("#headline").fill("Applied AI engineer focused on policy and institutions");
  await page.locator("#bio").fill("Built two ML platforms and now working on governance tooling.");
  await page.locator("#interests").fill("AI governance, policy design, mechanism design");
  await page.locator("#goals").fill("Prototype credible commitments for policy teams.");
  await page.locator("#ideasInFlight").fill("How to reduce strategic ambiguity in multi-party negotiations.");

  await page.getByRole("button", { name: "Save Profile" }).click();

  await expect(page).toHaveURL(/\/profile\?saved=1/);
  await expect(page.getByText("Profile updated.")).toBeVisible();

  const updated = await prismaClient.user.findUniqueOrThrow({
    where: {
      id: user.id,
    },
  });
  expect(updated.headline).toContain("Applied AI engineer");
  expect(updated.interests).toContain("AI governance");
});
