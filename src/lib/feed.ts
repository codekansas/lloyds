import type { ArticleQualityRating } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { qualityWeightFromRating } from "@/lib/article-quality";

const dayMs = 24 * 60 * 60 * 1000;
export const maxFeedDayOffset = 6;

type FeedWindow =
  | {
      mode: "rolling-24h";
      dayOffset?: number;
    }
  | {
      mode: "all-time";
    };

const summaryStatusWeight = {
  COMPLETE: 3,
  PENDING: 2,
  FAILED: 1,
} as const;

const sourceTypeWeight = {
  CURATED_RSS: 3,
  USER_BLOG: 2,
  USER_SUBMISSION: 1,
} as const;

type RankablePost = {
  qualityRating: ArticleQualityRating | null;
  summaryStatus: "PENDING" | "COMPLETE" | "FAILED";
  sourceType: "CURATED_RSS" | "USER_SUBMISSION" | "USER_BLOG";
  createdAt: Date;
  publishedAt: Date | null;
};

const normalizeDayOffset = (dayOffset: number | undefined): number => {
  if (!Number.isFinite(dayOffset)) {
    return 0;
  }

  return Math.max(0, Math.min(maxFeedDayOffset, Math.floor(dayOffset ?? 0)));
};

const comparePosts = (left: RankablePost, right: RankablePost): number => {
  const qualityDelta = qualityWeightFromRating(right.qualityRating) - qualityWeightFromRating(left.qualityRating);
  if (qualityDelta !== 0) {
    return qualityDelta;
  }

  const summaryDelta = summaryStatusWeight[right.summaryStatus] - summaryStatusWeight[left.summaryStatus];
  if (summaryDelta !== 0) {
    return summaryDelta;
  }

  const createdDelta = right.createdAt.valueOf() - left.createdAt.valueOf();
  if (createdDelta !== 0) {
    return createdDelta;
  }

  const sourceDelta = sourceTypeWeight[right.sourceType] - sourceTypeWeight[left.sourceType];
  if (sourceDelta !== 0) {
    return sourceDelta;
  }

  return (right.publishedAt?.valueOf() ?? 0) - (left.publishedAt?.valueOf() ?? 0);
};

const buildWindowBounds = (window: FeedWindow): { start: Date; end: Date } | null => {
  if (window.mode === "all-time") {
    return null;
  }

  const normalizedOffset = normalizeDayOffset(window.dayOffset);
  const now = Date.now();
  const end = new Date(now - normalizedOffset * dayMs);
  const start = new Date(end.valueOf() - dayMs);

  return {
    start,
    end,
  };
};

export const getRankedFeedPosts = async (
  limit = 40,
  window: FeedWindow = { mode: "rolling-24h", dayOffset: 0 },
) => {
  const bounds = buildWindowBounds(window);

  const candidatePosts = await prisma.post.findMany({
    take: window.mode === "all-time" ? 300 : 180,
    where: bounds
      ? {
          createdAt: {
            gte: bounds.start,
            lt: bounds.end,
          },
        }
      : undefined,
    orderBy: [{ createdAt: "desc" }, { publishedAt: "desc" }],
    include: {
      feedSource: {
        select: {
          name: true,
        },
      },
      _count: {
        select: {
          comments: true,
        },
      },
    },
  });

  const ranked = candidatePosts.sort(comparePosts).slice(0, limit);

  return ranked;
};
