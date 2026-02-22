import { prisma } from "@/lib/prisma";
import { fetchArticleText } from "@/lib/article-text";
import { summarizeArticle } from "@/lib/summarizer";

export type SummaryJobResult = {
  processed: number;
  completed: number;
  failed: number;
  failures: string[];
};

export const processPendingSummaries = async (batchSize = 12): Promise<SummaryJobResult> => {
  const pendingPosts = await prisma.post.findMany({
    where: {
      summaryStatus: "PENDING",
    },
    take: batchSize,
    orderBy: [{ createdAt: "asc" }],
  });

  const result: SummaryJobResult = {
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
          summaryError: null,
        },
      });

      if (post.sourceType === "USER_BLOG" && post.submittedById) {
        await prisma.profileSignal.create({
          data: {
            userId: post.submittedById,
            sourcePostId: post.id,
            signalType: "BLOG_SUMMARY",
            content: summary.bullets.join(" "),
            score: Math.min(1, summary.bullets.length / 8),
          },
        });
      }

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

  return result;
};
