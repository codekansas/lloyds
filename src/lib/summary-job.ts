import { prisma } from "@/lib/prisma";
import { fetchArticleText } from "@/lib/article-text";
import { logEvent } from "@/lib/observability";
import { summarizeArticle } from "@/lib/summarizer";

export type SummaryJobResult = {
  batchSize: number;
  concurrency: number;
  processed: number;
  completed: number;
  failed: number;
  failures: string[];
};

const DEFAULT_SUMMARY_BATCH_SIZE = 12;
const MAX_SUMMARY_BATCH_SIZE = 60;
const DEFAULT_SUMMARY_CONCURRENCY = 4;
const MAX_SUMMARY_CONCURRENCY = 12;

const normalizeBatchSize = (requestedBatchSize: number | null | undefined): number => {
  if (typeof requestedBatchSize !== "number" || Number.isNaN(requestedBatchSize)) {
    return DEFAULT_SUMMARY_BATCH_SIZE;
  }

  return Math.max(1, Math.min(MAX_SUMMARY_BATCH_SIZE, Math.trunc(requestedBatchSize)));
};

const normalizeConcurrency = ({
  requestedConcurrency,
  batchSize,
}: {
  requestedConcurrency: number | null | undefined;
  batchSize: number;
}): number => {
  if (typeof requestedConcurrency !== "number" || Number.isNaN(requestedConcurrency)) {
    return Math.min(DEFAULT_SUMMARY_CONCURRENCY, batchSize);
  }

  return Math.max(1, Math.min(MAX_SUMMARY_CONCURRENCY, batchSize, Math.trunc(requestedConcurrency)));
};

const processPostSummary = async (post: { id: string; title: string; url: string; excerpt: string | null }) => {
  const articleText = await fetchArticleText(post.url, post.excerpt);
  const summary = await summarizeArticle(post.title, post.url, articleText);

  await prisma.post.update({
    where: {
      id: post.id,
    },
    data: {
      summaryStatus: "COMPLETE",
      summaryBullets: summary.bullets,
      summaryReadSeconds: summary.readSeconds,
      summaryModel: summary.model,
      summaryGeneratedAt: new Date(),
      qualityRating: summary.qualityRating,
      qualityRationale: summary.qualityRationale,
      qualityModel: summary.model,
      qualityScoredAt: new Date(),
      summaryError: null,
    },
  });
};

export const processPendingSummaries = async (
  requestedBatchSize?: number,
  requestedConcurrency?: number,
): Promise<SummaryJobResult> => {
  const batchSize = normalizeBatchSize(requestedBatchSize);
  const concurrency = normalizeConcurrency({
    requestedConcurrency,
    batchSize,
  });
  const pendingPosts = await prisma.post.findMany({
    where: {
      summaryStatus: "PENDING",
    },
    take: batchSize,
    orderBy: [{ createdAt: "asc" }],
  });

  const result: SummaryJobResult = {
    batchSize,
    concurrency,
    processed: pendingPosts.length,
    completed: 0,
    failed: 0,
    failures: [],
  };

  let cursor = 0;
  const nextPost = () => {
    const post = pendingPosts[cursor];
    cursor += 1;
    return post;
  };

  const workerCount = Math.min(concurrency, pendingPosts.length);
  const workers = Array.from({ length: workerCount }, () => (async () => {
    while (true) {
      const post = nextPost();
      if (!post) {
        break;
      }

      try {
        await processPostSummary(post);
        result.completed += 1;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Summary generation failed.";
        result.failures.push(`${post.id}: ${message}`);

        await prisma.post.update({
          where: {
            id: post.id,
          },
          data: {
            summaryStatus: "FAILED",
            summaryError: message,
          },
        });

        result.failed += 1;
      }
    }
  })());

  await Promise.all(workers);

  logEvent("info", "summary.job.batch.completed", {
    requestedBatchSize: requestedBatchSize ?? null,
    requestedConcurrency: requestedConcurrency ?? null,
    batchSize,
    concurrency,
    processed: result.processed,
    completed: result.completed,
    failed: result.failed,
    failureCount: result.failures.length,
  });

  return result;
};
