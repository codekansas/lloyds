import { prisma } from "@/lib/prisma";

const nowMs = () => Date.now();

const ageHours = (dateValue: Date | null): number => {
  if (!dateValue) {
    return 240;
  }

  return Math.max(0, (nowMs() - dateValue.valueOf()) / 3_600_000);
};

const scorePost = (post: {
  publishedAt: Date | null;
  createdAt: Date;
  sourceType: "CURATED_RSS" | "USER_SUBMISSION" | "USER_BLOG";
  summaryStatus: "PENDING" | "COMPLETE" | "FAILED";
}): number => {
  const freshnessHours = Math.min(ageHours(post.publishedAt ?? post.createdAt), 240);
  const freshnessScore = Math.max(0, 100 - freshnessHours * 0.7);
  const sourceScore = post.sourceType === "CURATED_RSS" ? 18 : post.sourceType === "USER_BLOG" ? 12 : 8;
  const summaryScore = post.summaryStatus === "COMPLETE" ? 10 : post.summaryStatus === "PENDING" ? 5 : 0;

  return freshnessScore + sourceScore + summaryScore;
};

export const getRankedFeedPosts = async (limit = 40) => {
  const candidatePosts = await prisma.post.findMany({
    take: 120,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    include: {
      feedSource: {
        select: {
          name: true,
        },
      },
      comments: {
        orderBy: [{ createdAt: "desc" }],
        take: 5,
        include: {
          author: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  const ranked = candidatePosts
    .map((post) => ({
      post,
      score: scorePost(post),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ post }) => post);

  return ranked;
};
