import { expect, test } from "./fixtures";
import { prismaClient, seedPost } from "./helpers/db";

const cronSecret = process.env.CRON_SECRET ?? "e2e-cron-secret";

test("blocks unauthorized cron access", async ({ request }) => {
  const response = await request.get("/api/jobs/summarize");
  expect(response.status()).toBe(401);
});

test("processes pending summaries with authorized cron secret", async ({ request, baseURL }) => {
  if (!baseURL) {
    throw new Error("baseURL is not configured for Playwright.");
  }

  const articleUrl = `${baseURL}/api/test/article?seed=summary`;

  await seedPost({
    title: "Pending Summary Post",
    url: articleUrl,
    canonicalUrl: articleUrl,
    sourceType: "USER_SUBMISSION",
    summaryStatus: "PENDING",
    summaryBullets: [],
    summaryReadSeconds: undefined,
    excerpt:
      "This fallback excerpt ensures we still have content if external fetchers fail before raw HTML extraction.",
  });

  const response = await request.get("/api/jobs/summarize", {
    headers: {
      authorization: `Bearer ${cronSecret}`,
    },
  });

  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { completed?: number; failed?: number };
  const completedCount = payload.completed ?? 0;
  const failedCount = payload.failed ?? 0;
  expect(completedCount + failedCount).toBeGreaterThanOrEqual(1);

  const post = await prismaClient.post.findFirstOrThrow({
    where: {
      canonicalUrl: articleUrl,
    },
  });

  if (completedCount > 0) {
    expect(post.summaryStatus).toBe("COMPLETE");
    expect(Array.isArray(post.summaryBullets)).toBeTruthy();
    expect(post.summaryReadSeconds).toBeGreaterThanOrEqual(10);
    expect(post.qualityModel).toBeTruthy();
  } else {
    expect(failedCount).toBeGreaterThanOrEqual(1);
    expect(post.summaryStatus).toBe("PENDING");
    expect(post.summaryError).toBeTruthy();
    expect(post.qualityRating).toBeNull();
  }
});

test("status endpoint highlights summary backlog", async ({ request }) => {
  const createdAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const seedUrl = `https://example.com/pending-${createdAt.valueOf()}`;

  await seedPost({
    title: "Pending Summary Backlog",
    url: seedUrl,
    canonicalUrl: seedUrl,
    sourceType: "CURATED_RSS",
    summaryStatus: "PENDING",
    summaryBullets: [],
    summaryReadSeconds: undefined,
    excerpt: "Queued for summarization.",
    createdAt,
  });

  const response = await request.get("/api/status");
  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as {
    summaryQueue?: {
      pendingCount?: number | null;
    };
    services?: Array<{
      id: string;
      state: "operational" | "degraded" | "outage";
    }>;
  };

  const summaryService = payload.services?.find((service) => service.id === "post-summarization");
  expect(summaryService).toBeDefined();
  expect(summaryService?.state).not.toBe("operational");
  expect(payload.summaryQueue?.pendingCount).toBeGreaterThanOrEqual(1);
});
