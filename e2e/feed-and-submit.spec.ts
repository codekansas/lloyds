import { expect, test } from "./fixtures";
import { loginAsUser } from "./helpers/auth";
import { createFeedSource, prismaClient, seedPost } from "./helpers/db";

test("creates a user session and allows feed access after manifesto acceptance", async ({ page, baseURL }) => {
  if (!baseURL) {
    throw new Error("baseURL is not configured for Playwright.");
  }

  const { user, sessionToken } = await loginAsUser(page.context(), {
    baseUrl: baseURL,
    manifestoAccepted: true,
    name: "Fresh Member",
  });

  expect(sessionToken.length).toBeGreaterThan(10);

  await page.goto("/feed");

  await expect(page).toHaveURL(/\/feed/);
  await expect(page.getByRole("heading", { name: "Lloyd's List" })).toBeVisible();

  const persistedUser = await prismaClient.user.findUniqueOrThrow({
    where: {
      id: user.id,
    },
  });

  expect(persistedUser.manifestoAcceptedAt).not.toBeNull();
});

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

test("posts comments on a feed item and stores them against the author", async ({ page, baseURL }) => {
  if (!baseURL) {
    throw new Error("baseURL is not configured for Playwright.");
  }

  const { user } = await loginAsUser(page.context(), {
    baseUrl: baseURL,
    manifestoAccepted: true,
    name: "Commenter",
  });

  const source = await createFeedSource("https://e2e-comments.local/feed.xml", "Comments Source");

  const post = await seedPost({
    title: "Building Better Commons",
    url: "https://example.com/building-better-commons",
    canonicalUrl: "https://example.com/building-better-commons",
    sourceType: "CURATED_RSS",
    feedSourceId: source.id,
    summaryStatus: "COMPLETE",
    summaryReadSeconds: 14,
    summaryBullets: [
      "Institution quality improves when communities create explicit norms for disagreement.",
      "Shared standards for evidence lower coordination overhead.",
    ],
  });

  await page.goto("/feed");

  const postCard = page.locator(`[data-testid="feed-post-${post.id}"]`);

  await expect(postCard.getByText("Comments (0)")).toBeVisible();
  await postCard.locator(`#comment-${post.id}`).fill("Strong framing. The norms point is especially actionable.");
  await postCard.getByRole("button", { name: "Post Comment" }).click();

  await expect(page).toHaveURL(/\/feed\?commented=1/);
  await expect(page.getByText("Comment posted.")).toBeVisible();
  await expect(postCard.getByText("Strong framing. The norms point is especially actionable.")).toBeVisible();

  const savedComment = await prismaClient.postComment.findFirstOrThrow({
    where: {
      postId: post.id,
      authorId: user.id,
    },
  });

  expect(savedComment.content).toBe("Strong framing. The norms point is especially actionable.");
});
