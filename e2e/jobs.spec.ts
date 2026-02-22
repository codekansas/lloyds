import { expect, test } from "./fixtures";
import { createUser, prismaClient, seedAvailability, seedPost } from "./helpers/db";

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
  const payload = (await response.json()) as { completed?: number };
  expect(payload.completed).toBeGreaterThanOrEqual(1);

  const post = await prismaClient.post.findFirstOrThrow({
    where: {
      canonicalUrl: articleUrl,
    },
  });

  expect(post.summaryStatus).toBe("COMPLETE");
  expect(Array.isArray(post.summaryBullets)).toBeTruthy();
  expect(post.summaryReadSeconds).toBeGreaterThanOrEqual(10);
});

test("creates matches from open availability windows", async ({ request }) => {
  const userA = await createUser({
    email: "match-a@example.test",
    name: "Match A",
    manifestoAcceptedAt: new Date(),
    interests: "AI governance",
    goals: "Build durable policy tools",
    ideasInFlight: "Institution design",
  });

  const userB = await createUser({
    email: "match-b@example.test",
    name: "Match B",
    manifestoAcceptedAt: new Date(),
    interests: "AI governance and engineering",
    goals: "Improve decision quality",
    ideasInFlight: "Risk governance systems",
  });

  const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.valueOf() + 75 * 60 * 1000);

  await seedAvailability({
    userId: userA.id,
    startsAt,
    endsAt,
    timezone: "UTC",
    mode: "EITHER",
  });

  await seedAvailability({
    userId: userB.id,
    startsAt: new Date(startsAt.valueOf() + 10 * 60 * 1000),
    endsAt: new Date(endsAt.valueOf() + 10 * 60 * 1000),
    timezone: "UTC",
    mode: "EITHER",
  });

  const response = await request.get("/api/jobs/match-users", {
    headers: {
      authorization: `Bearer ${cronSecret}`,
    },
  });

  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as { matchesCreated?: number };
  expect(payload.matchesCreated).toBeGreaterThanOrEqual(1);

  const matchCount = await prismaClient.match.count();
  expect(matchCount).toBeGreaterThanOrEqual(1);
});
