import { expect, test } from "./fixtures";
import { loginAsUser } from "./helpers/auth";
import { createFeedSource, prismaClient, seedPost } from "./helpers/db";

test("renders ranked feed entries with AI bullets", async ({ page, baseURL }) => {
  if (!baseURL) {
    throw new Error("baseURL is not configured for Playwright.");
  }

  await loginAsUser(page.context(), {
    baseUrl: baseURL,
    manifestoAccepted: true,
    name: "Feed Reader",
  });

  const source = await createFeedSource("https://e2e-source.local/feed.xml", "E2E Curated Feed");

  await seedPost({
    title: "Coordination Under Model Uncertainty",
    url: "https://example.com/coordination-under-uncertainty",
    canonicalUrl: "https://example.com/coordination-under-uncertainty",
    sourceType: "CURATED_RSS",
    feedSourceId: source.id,
    summaryStatus: "COMPLETE",
    summaryReadSeconds: 18,
    summaryBullets: [
      "The article argues that robust institutions matter more than single-point forecasts.",
      "Case studies show better outcomes when teams expose assumptions before committing capital.",
      "A practical framework is offered for updating plans as evidence quality changes.",
      "The author highlights failure modes where confidence outruns available data.",
    ],
  });

  await page.goto("/feed");

  await expect(page.getByRole("heading", { name: "Lloyd's List" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Coordination Under Model Uncertainty" })).toBeVisible();
  await expect(
    page.getByText("The article argues that robust institutions matter more than single-point forecasts."),
  ).toBeVisible();
  await expect(page.getByText("18s read")).toBeVisible();
});

test("submits a new post and stores it as a user submission", async ({ page, baseURL }) => {
  if (!baseURL) {
    throw new Error("baseURL is not configured for Playwright.");
  }

  const { user } = await loginAsUser(page.context(), {
    baseUrl: baseURL,
    manifestoAccepted: true,
    name: "Submitter",
  });

  await page.goto("/submit");

  await page.locator("#title").fill("A Field Guide to High-Agency Collaboration");
  await page
    .locator("#url")
    .fill("https://example.com/high-agency-collaboration?utm_source=e2e&ref=playwright");
  await page
    .locator("#excerpt")
    .fill("Useful synthesis on coordination overhead, commitment devices, and practical meeting cadence.");

  await page.getByRole("button", { name: "Add to Queue" }).click();

  await expect(page).toHaveURL(/\/feed\?submitted=1/);
  await expect(page.getByText("Submission accepted. Summary generation queued.")).toBeVisible();

  const submittedPost = await prismaClient.post.findFirstOrThrow({
    where: {
      submittedById: user.id,
      sourceType: "USER_SUBMISSION",
    },
  });

  expect(submittedPost.title).toBe("A Field Guide to High-Agency Collaboration");
  expect(submittedPost.canonicalUrl).toBe("https://example.com/high-agency-collaboration?ref=playwright");
});
