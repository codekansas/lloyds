import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { fetchArticleText } from "@/lib/article-text";
import { formatErrorSummary, getErrorDiagnostics, logEvent } from "@/lib/observability";
import { summarizeArticle, SummaryGradingError } from "@/lib/summarizer";

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

const buildSummaryErrorContext = (error: unknown) => {
  if (error instanceof SummaryGradingError) {
    return {
      errorSummary: formatErrorSummary(error, 420),
      reason: error.reason,
      gradingModel: error.gradingModel,
      responseId: error.responseId,
      parseError: error.parseError,
      outputPreview: error.outputPreview,
      diagnostics: error.diagnostics ?? getErrorDiagnostics(error),
    };
  }

  return {
    errorSummary: formatErrorSummary(error, 420),
    reason: "unknown",
    gradingModel: null,
    responseId: null,
    parseError: null,
    outputPreview: null,
    diagnostics: getErrorDiagnostics(error),
  };
};

const requeueLegacyFallbackScores = async (): Promise<number> => {
  const result = await prisma.post.updateMany({
    where: {
      summaryStatus: "COMPLETE",
      summaryModel: {
        startsWith: "fallback-extractive-v1",
      },
    },
    data: {
      summaryStatus: "PENDING",
      summaryBullets: Prisma.DbNull,
      summaryReadSeconds: null,
      summaryModel: null,
      summaryGeneratedAt: null,
      qualityRating: null,
      qualityRationale: null,
      qualityModel: null,
      qualityScoredAt: null,
      summaryError: "Requeued legacy fallback score for constitutional rescoring.",
    },
  });

  if (result.count > 0) {
    logEvent("info", "summary.job.legacy_fallback.requeued", {
      requeued: result.count,
    });
  }

  return result.count;
};

export const processPendingSummaries = async (
  requestedBatchSize?: number,
  requestedConcurrency?: number,
): Promise<SummaryJobResult> => {
  await requeueLegacyFallbackScores();

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
    orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
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
        const errorContext = buildSummaryErrorContext(error);
        const message = `${errorContext.errorSummary}${errorContext.gradingModel ? ` [model=${errorContext.gradingModel}]` : ""}`;
        result.failures.push(`${post.id}: ${message}`);

        logEvent("warn", "summary.job.post.retryable_failure", {
          postId: post.id,
          reason: errorContext.reason,
          gradingModel: errorContext.gradingModel,
          responseId: errorContext.responseId,
          parseError: errorContext.parseError,
          outputPreview: errorContext.outputPreview,
          diagnostics: errorContext.diagnostics,
        });

        await prisma.post.update({
          where: {
            id: post.id,
          },
          data: {
            summaryStatus: "PENDING",
            summaryBullets: Prisma.DbNull,
            summaryReadSeconds: null,
            summaryModel: null,
            summaryGeneratedAt: null,
            qualityRating: null,
            qualityRationale: null,
            qualityModel: null,
            qualityScoredAt: null,
            summaryError: JSON.stringify({
              attemptedAt: new Date().toISOString(),
              reason: errorContext.reason,
              gradingModel: errorContext.gradingModel,
              responseId: errorContext.responseId,
              parseError: errorContext.parseError,
              outputPreview: errorContext.outputPreview,
              message: errorContext.errorSummary,
            }),
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
