import { prisma } from "@/lib/prisma";
import { fetchArticleText } from "@/lib/article-text";
import { logEvent } from "@/lib/observability";
import { summarizeArticle } from "@/lib/summarizer";

export type SummaryJobResult = {
  batchSize: number;
  processed: number;
  completed: number;
  failed: number;
  failures: string[];
};

const DEFAULT_SUMMARY_BATCH_SIZE = 12;
const MAX_SUMMARY_BATCH_SIZE = 60;

const normalizeBatchSize = (requestedBatchSize: number | null | undefined): number => {
  if (typeof requestedBatchSize !== "number" || Number.isNaN(requestedBatchSize)) {
    return DEFAULT_SUMMARY_BATCH_SIZE;
  }

  return Math.max(1, Math.min(MAX_SUMMARY_BATCH_SIZE, Math.trunc(requestedBatchSize)));
};

export const processPendingSummaries = async (requestedBatchSize?: number): Promise<SummaryJobResult> => {
  const batchSize = normalizeBatchSize(requestedBatchSize);
  const pendingPosts = await prisma.post.findMany({
    where: {
      summaryStatus: "PENDING",
    },
    take: batchSize,
    orderBy: [{ createdAt: "asc" }],
  });

  const result: SummaryJobResult = {
    batchSize,
    processed: pendingPosts.length,
    completed: 0,
    failed: 0,
    failures: [],
  };

  for (const post of pendingPosts) {
    try {
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

  logEvent("info", "summary.job.batch.completed", {
    requestedBatchSize: requestedBatchSize ?? null,
    batchSize,
    processed: result.processed,
    completed: result.completed,
    failed: result.failed,
    failureCount: result.failures.length,
  });

  return result;
};
