import { expect, test } from "./fixtures";
import { loginAsUser } from "./helpers/auth";
import { createFeedSource, prismaClient, seedPost } from "./helpers/db";

test("creates a user session and renders feed home", async ({ page, baseURL }) => {
  if (!baseURL) {
    throw new Error("baseURL is not configured for Playwright.");
  }

  const { user, sessionToken } = await loginAsUser(page.context(), {
    baseUrl: baseURL,
    manifestoAccepted: true,
    name: "Fresh Member",
  });

  expect(sessionToken.length).toBeGreaterThan(10);

  await page.goto("/");

  await expect(page).toHaveURL(/\/$/);
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

  await page.goto("/");

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

test("defaults to last 24h and supports all-time feed queries", async ({ page, baseURL }) => {
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

  await page.goto("/");

  await expect(page.getByRole("link", { name: highSignalTitle })).toBeVisible();
  await expect(page.getByRole("link", { name: lowSignalTitle })).toBeVisible();
  await expect(page.getByRole("link", { name: olderTitle })).toHaveCount(0);

  const firstCard = page.locator(".feed-card").first();
  await expect(firstCard.getByRole("link", { name: highSignalTitle })).toBeVisible();

  await page.goto("/?window=all");
  await expect(page).toHaveURL(/window=all/);
  await expect(page.getByRole("link", { name: olderTitle })).toBeVisible();
});

test("paginates feed results 10 posts at a time", async ({ page, baseURL }) => {
  if (!baseURL) {
    throw new Error("baseURL is not configured for Playwright.");
  }

  await loginAsUser(page.context(), {
    baseUrl: baseURL,
    manifestoAccepted: true,
    name: "Pagination Reader",
  });

  const source = await createFeedSource("https://e2e-pagination.local/feed.xml", "Pagination Source");
  const now = Date.now();

  await Promise.all(
    Array.from({ length: 12 }, (_, idx) =>
      seedPost({
        title: `Paged Post ${String(idx + 1).padStart(2, "0")}`,
        url: `https://example.com/paged-post-${idx + 1}`,
        canonicalUrl: `https://example.com/paged-post-${idx + 1}`,
        sourceType: "CURATED_RSS",
        feedSourceId: source.id,
        summaryStatus: "COMPLETE",
        summaryBullets: [`Summary for paged post ${idx + 1}.`],
        createdAt: new Date(now - idx * 60_000),
      }),
    ),
  );

  await page.goto("/");

  await expect(page.locator(".feed-card")).toHaveCount(10);
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await expect(page.getByRole("link", { name: "Next page" })).toBeVisible();

  await page.getByRole("link", { name: "Next page" }).click();
  await expect(page).toHaveURL(/\/\?page=2/);
  await expect(page.locator(".feed-card")).toHaveCount(2);
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await expect(page.getByRole("link", { name: "Previous page" })).toBeVisible();
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

  await page.goto("/");

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

test("rejects comment submissions with parent IDs that are outside the current post", async ({ page, baseURL }) => {
  if (!baseURL) {
    throw new Error("baseURL is not configured for Playwright.");
  }

  const { user } = await loginAsUser(page.context(), {
    baseUrl: baseURL,
    manifestoAccepted: true,
    name: "Invalid Parent Tester",
  });

  const source = await createFeedSource("https://e2e-invalid-parent.local/feed.xml", "Invalid Parent Source");
  const primaryPost = await seedPost({
    title: "Primary Post",
    url: "https://example.com/primary-post",
    canonicalUrl: "https://example.com/primary-post",
    sourceType: "CURATED_RSS",
    feedSourceId: source.id,
    summaryStatus: "COMPLETE",
    summaryBullets: ["Primary post used for comment form submission."],
  });
  const unrelatedPost = await seedPost({
    title: "Unrelated Post",
    url: "https://example.com/unrelated-post",
    canonicalUrl: "https://example.com/unrelated-post",
    sourceType: "CURATED_RSS",
    feedSourceId: source.id,
    summaryStatus: "COMPLETE",
    summaryBullets: ["Unrelated post used to mint a valid-but-foreign parent comment ID."],
  });

  const foreignComment = await prismaClient.postComment.create({
    data: {
      postId: unrelatedPost.id,
      authorId: user.id,
      content: "Foreign parent candidate.",
      format: "MARKDOWN",
    },
  });

  await page.goto(`/feed/${primaryPost.id}/comments`);
  await page.locator(`#comment-${primaryPost.id}`).fill("Attempting to reference a comment from another post.");
  await page
    .locator('input[name=\"parentIds\"]')
    .evaluate((node, nextValue) => {
      (node as HTMLInputElement).value = nextValue;
    }, JSON.stringify([foreignComment.id]));
  await page.getByRole("button", { name: "Post Comment" }).click();

  await expect(page).toHaveURL(new RegExp(`/feed/${primaryPost.id}/comments\\?commentError=invalid-parent`));
  await expect(page.getByText("One or more referenced parent comments were invalid.")).toBeVisible();
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
  await page.locator(`#comment-${post.id}`).fill("Synthesis across !1 and !2 makes the argument stronger.");
  await page.getByRole("button", { name: "Post Comment" }).click();

  await expect(page).toHaveURL(new RegExp(`/feed/${post.id}/comments\\?commented=1`));
  const latestComment = page.locator(".comment-lattice-item").last();
  const firstReferenceChip = latestComment.locator(".comment-link-row", { hasText: "Replies to" }).locator(".comment-ref-chip").first();
  const firstReferenceTooltip = firstReferenceChip.locator(".comment-ref-tooltip");
  await expect(firstReferenceTooltip).not.toBeVisible();
  await firstReferenceChip.hover();
  await expect(firstReferenceTooltip).toBeVisible();
  await expect(latestComment.locator(".comment-body a[href^='#comment-']")).toHaveCount(2);

  const savedComment = await prismaClient.postComment.findFirstOrThrow({
    where: {
      postId: post.id,
      authorId: user.id,
      content: "Synthesis across !1 and !2 makes the argument stronger.",
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
  await page.getByRole("tab", { name: "Markdown" }).click();
  await expect(page.locator(`#comment-${post.id}`)).toHaveValue("Rich text composition path.");
  await page.getByRole("tab", { name: "Rich Text" }).click();
  await page.getByRole("button", { name: "Post Comment" }).click();

  await expect(page).toHaveURL(new RegExp(`/feed/${post.id}/comments\\?commented=1`));

  const savedComment = await prismaClient.postComment.findFirstOrThrow({
    where: {
      postId: post.id,
      authorId: user.id,
      format: "MARKDOWN",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  expect(savedComment.content).toBe("Rich text composition path.");
});
