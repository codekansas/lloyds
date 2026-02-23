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
  const summaryBullets = [
    "The article argues that robust institutions matter more than single-point forecasts.",
    "Case studies show better outcomes when teams expose assumptions before committing capital.",
    "A practical framework is offered for updating plans as evidence quality changes.",
    "The author highlights failure modes where confidence outruns available data.",
  ];

  const post = await seedPost({
    title: "Coordination Under Model Uncertainty",
    url: "https://example.com/coordination-under-uncertainty",
    canonicalUrl: "https://example.com/coordination-under-uncertainty",
    sourceType: "CURATED_RSS",
    feedSourceId: source.id,
    summaryStatus: "COMPLETE",
    summaryReadSeconds: 18,
    summaryBullets,
  });

  await page.goto("/feed");

  const postCard = page.locator(`[data-testid="feed-post-${post.id}"]`);

  await expect(page.getByRole("heading", { name: "Lloyd's List" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Coordination Under Model Uncertainty" })).toBeVisible();
  await expect(postCard.getByText(summaryBullets[0])).toBeVisible();
  await expect(postCard.getByText(summaryBullets[1])).toBeVisible();
  await expect(postCard.getByText(summaryBullets[2])).toBeHidden();
  await expect(postCard.getByText("18s read")).toBeVisible();

  const summaryToggle = postCard.locator(".feed-summary-more summary");
  await summaryToggle.click();
  await expect(postCard.getByText(summaryBullets[2])).toBeVisible();
  await summaryToggle.click();
  await expect(postCard.getByText(summaryBullets[2])).toBeHidden();
});

test("defaults to last 24h and orders feed by constitutional quality rating", async ({ page, baseURL }) => {
  if (!baseURL) {
    throw new Error("baseURL is not configured for Playwright.");
  }

  await loginAsUser(page.context(), {
    baseUrl: baseURL,
    manifestoAccepted: true,
    name: "Quality Reader",
  });

  const source = await createFeedSource("https://e2e-quality.local/feed.xml", "Quality Source");
  const now = Date.now();

  const highSignalTitle = "Forecasting with error bars and postmortems";
  const lowSignalTitle = "Hot takes with no sourcing";
  const olderTitle = "Three-day old archival analysis";

  await seedPost({
    title: highSignalTitle,
    url: "https://example.com/forecasting-postmortems",
    canonicalUrl: "https://example.com/forecasting-postmortems",
    sourceType: "CURATED_RSS",
    feedSourceId: source.id,
    summaryStatus: "COMPLETE",
    qualityRating: "UNDERWRITERS_CONFIDENCE",
    qualityRationale: "Cites sources, explores uncertainty, and translates findings into operational decisions.",
    summaryBullets: [
      "The author compares baseline forecasts against calibrated intervals and reports error decomposition.",
      "Operational implications are explicit, including where confidence should remain low.",
    ],
    createdAt: new Date(now - 2 * 60 * 60 * 1000),
  });

  await seedPost({
    title: lowSignalTitle,
    url: "https://example.com/hot-takes",
    canonicalUrl: "https://example.com/hot-takes",
    sourceType: "CURATED_RSS",
    feedSourceId: source.id,
    summaryStatus: "COMPLETE",
    qualityRating: "COMMON_RUMOUR",
    qualityRationale: "Claims are mostly unsupported and arguments are thin.",
    summaryBullets: [
      "Broad claims are made without verifiable evidence or reproducible data.",
      "Counterarguments are dismissed rather than addressed with substance.",
    ],
    createdAt: new Date(now - 20 * 60 * 1000),
  });

  await seedPost({
    title: olderTitle,
    url: "https://example.com/old-analysis",
    canonicalUrl: "https://example.com/old-analysis",
    sourceType: "CURATED_RSS",
    feedSourceId: source.id,
    summaryStatus: "COMPLETE",
    qualityRating: "LLOYDS_ASSURANCE",
    qualityRationale: "Rare archival quality analysis with strong sourcing and durable relevance.",
    summaryBullets: [
      "Long-horizon analysis with transparent methods and external validation.",
      "Directly useful for strategic planning under uncertainty.",
    ],
    createdAt: new Date(now - 52 * 60 * 60 * 1000),
  });

  await page.goto("/feed");

  await expect(page.getByRole("link", { name: highSignalTitle })).toBeVisible();
  await expect(page.getByRole("link", { name: lowSignalTitle })).toBeVisible();
  await expect(page.getByRole("link", { name: olderTitle })).toHaveCount(0);

  const firstCard = page.locator(".feed-card").first();
  await expect(firstCard.getByRole("link", { name: highSignalTitle })).toBeVisible();

  await page.getByRole("link", { name: "All time" }).click();
  await expect(page).toHaveURL(/window=all/);
  await expect(page.getByRole("link", { name: olderTitle })).toBeVisible();
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
  await expect(page.locator("#excerpt")).toHaveCount(0);

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
  await postCard.getByRole("link", { name: "View comments (0)" }).click();

  await expect(page).toHaveURL(new RegExp(`/feed/${post.id}/comments`));
  await page.locator(`#comment-${post.id}`).fill("Strong framing. The norms point is especially actionable.");
  await page.getByRole("button", { name: "Post Comment" }).click();

  await expect(page).toHaveURL(new RegExp(`/feed/${post.id}/comments\\?commented=1`));
  await expect(page.getByText("Comment posted.")).toBeVisible();
  await expect(page.getByText("Strong framing. The norms point is especially actionable.")).toBeVisible();

  const savedComment = await prismaClient.postComment.findFirstOrThrow({
    where: {
      postId: post.id,
      authorId: user.id,
    },
  });

  expect(savedComment.content).toBe("Strong framing. The norms point is especially actionable.");
});

test("builds DAG edges when a comment references multiple parent comments", async ({ page, baseURL }) => {
  if (!baseURL) {
    throw new Error("baseURL is not configured for Playwright.");
  }

  const { user } = await loginAsUser(page.context(), {
    baseUrl: baseURL,
    manifestoAccepted: true,
    name: "Graph Builder",
  });

  const source = await createFeedSource("https://e2e-dag.local/feed.xml", "DAG Source");
  const post = await seedPost({
    title: "DAG-style Threading",
    url: "https://example.com/dag-threading",
    canonicalUrl: "https://example.com/dag-threading",
    sourceType: "CURATED_RSS",
    feedSourceId: source.id,
    summaryStatus: "COMPLETE",
    summaryReadSeconds: 12,
    summaryBullets: ["Threading can model many-to-many relationships when comments point to multiple predecessors."],
  });

  await prismaClient.postComment.createMany({
    data: [
      {
        postId: post.id,
        authorId: user.id,
        content: "Root thought on this thread.",
        format: "MARKDOWN",
      },
      {
        postId: post.id,
        authorId: user.id,
        content: "Second parent comment for synthesis.",
        format: "MARKDOWN",
      },
    ],
  });

  await page.goto(`/feed/${post.id}/comments`);
  await page.locator(`#comment-${post.id}`).fill("Synthesis across >>1 and >>2 makes the argument stronger.");
  await page.getByRole("button", { name: "Post Comment" }).click();

  await expect(page).toHaveURL(new RegExp(`/feed/${post.id}/comments\\?commented=1`));

  const savedComment = await prismaClient.postComment.findFirstOrThrow({
    where: {
      postId: post.id,
      authorId: user.id,
      content: "Synthesis across >>1 and >>2 makes the argument stronger.",
    },
    include: {
      parentEdges: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  expect(savedComment.parentEdges).toHaveLength(2);
});

test("supports rich text mode when posting comments", async ({ page, baseURL }) => {
  if (!baseURL) {
    throw new Error("baseURL is not configured for Playwright.");
  }

  const { user } = await loginAsUser(page.context(), {
    baseUrl: baseURL,
    manifestoAccepted: true,
    name: "Rich Text Author",
  });

  const source = await createFeedSource("https://e2e-rich.local/feed.xml", "Rich Source");
  const post = await seedPost({
    title: "Rich Text Commenting",
    url: "https://example.com/rich-text-commenting",
    canonicalUrl: "https://example.com/rich-text-commenting",
    sourceType: "CURATED_RSS",
    feedSourceId: source.id,
    summaryStatus: "COMPLETE",
    summaryReadSeconds: 9,
    summaryBullets: ["Rich text editing helps users compose nuanced arguments quickly."],
  });

  await page.goto(`/feed/${post.id}/comments`);
  await page.getByRole("tab", { name: "Rich Text" }).click();
  await page.locator(".comment-rich-editor").fill("Rich text composition path.");
  await page.getByRole("button", { name: "Post Comment" }).click();

  await expect(page).toHaveURL(new RegExp(`/feed/${post.id}/comments\\?commented=1`));

  const savedComment = await prismaClient.postComment.findFirstOrThrow({
    where: {
      postId: post.id,
      authorId: user.id,
      format: "RICH_TEXT",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  expect(savedComment.content).toContain("Rich text composition path.");
});
