import { expect, test } from "./fixtures";
import { loginAsUser } from "./helpers/auth";
import { prismaClient, seedAvailability } from "./helpers/db";
import { toDatetimeLocal } from "./helpers/time";

test("updates profile and creates a linked blog feed source", async ({ page, baseURL }) => {
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
  await page.locator("#blogFeedUrl").fill("https://blog.example.test/feed.xml");

  await page.getByRole("button", { name: "Save Profile" }).click();

  await expect(page).toHaveURL(/\/profile\?saved=1/);
  await expect(page.getByText("Profile updated.")).toBeVisible();

  const updated = await prismaClient.user.findUniqueOrThrow({
    where: {
      id: user.id,
    },
  });
  expect(updated.headline).toContain("Applied AI engineer");
  expect(updated.blogFeedUrl).toBe("https://blog.example.test/feed.xml");

  const blogSource = await prismaClient.feedSource.findFirstOrThrow({
    where: {
      ownerUserId: user.id,
      sourceType: "USER_BLOG",
    },
  });
  expect(blogSource.url).toBe("https://blog.example.test/feed.xml");
});

test("captures availability and creates a conversation match", async ({ page, baseURL }) => {
  if (!baseURL) {
    throw new Error("baseURL is not configured for Playwright.");
  }

  const { user } = await loginAsUser(page.context(), {
    baseUrl: baseURL,
    manifestoAccepted: true,
    name: "Matching User",
    interests: "AI governance, rationality",
    goals: "Ship institution design prototypes",
    ideasInFlight: "Coordination under uncertainty",
  });

  const counterpart = await prismaClient.user.create({
    data: {
      email: "counterpart@example.test",
      name: "Counterpart",
      manifestoAcceptedAt: new Date(),
      headline: "Founder working on long-term coordination systems",
      interests: "AI governance, institutional design",
      goals: "Build better cross-org decision systems",
      ideasInFlight: "Governance architecture for advanced AI teams",
    },
  });

  const now = new Date();
  const startA = new Date(now.valueOf() + 2 * 60 * 60 * 1000);
  startA.setSeconds(0, 0);
  const endA = new Date(startA.valueOf() + 90 * 60 * 1000);

  const startB = new Date(startA.valueOf() + 15 * 60 * 1000);
  const endB = new Date(endA.valueOf() + 15 * 60 * 1000);

  await seedAvailability({
    userId: counterpart.id,
    startsAt: startB,
    endsAt: endB,
    timezone: "UTC",
    mode: "EITHER",
    location: "London",
  });

  await page.goto("/matching");

  await page.locator("#startsAt").fill(toDatetimeLocal(startA));
  await page.locator("#endsAt").fill(toDatetimeLocal(endA));
  await page.locator("#timezone").fill("UTC");
  await page.locator("#mode").selectOption("EITHER");
  await page.locator("#location").fill("London");
  await page.locator("#notes").fill("Looking for a serious design review conversation.");

  await page.getByRole("button", { name: "Save Window" }).click();
  await expect(page).toHaveURL(/\/matching\?availability=added/);
  await expect(page.getByText("Availability added.")).toBeVisible();

  await page.getByRole("button", { name: "Run Matching Now" }).click();

  await expect(page).toHaveURL(/\/matching\?matched=1/);
  await expect(page.getByText("Matching run complete: 1 matches created.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Counterpart" })).toBeVisible();

  const match = await prismaClient.match.findFirstOrThrow({
    where: {
      OR: [{ userAId: user.id }, { userBId: user.id }],
    },
  });

  expect(match.mode).toBe("VIRTUAL");
  expect(match.aiRationale).toBeTruthy();
});
