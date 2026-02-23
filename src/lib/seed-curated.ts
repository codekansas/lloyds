import { getCuratedFeedSeeds } from "@/lib/curated-feeds";
import { prisma } from "@/lib/prisma";

export type EnsureCuratedFeedSourcesResult = {
  upsertedCount: number;
  deactivatedCount: number;
  source: "gist" | "fallback";
  sourceCount: number;
  referenceUrl: string;
};

export const ensureCuratedFeedSources = async (): Promise<EnsureCuratedFeedSourcesResult> => {
  const { feeds, source, referenceUrl } = await getCuratedFeedSeeds();

  for (const feed of feeds) {
    await prisma.feedSource.upsert({
      where: {
        url: feed.url,
      },
      update: {
        name: feed.name,
        description: feed.description,
        isActive: true,
      },
      create: {
        name: feed.name,
        url: feed.url,
        description: feed.description,
        sourceType: "CURATED",
      },
    });
  }

  let deactivatedCount = 0;

  if (source === "gist") {
    const curatedUrls = feeds.map((feed) => feed.url);
    const deactivationResult = await prisma.feedSource.updateMany({
      where:
        curatedUrls.length > 0
          ? {
              sourceType: "CURATED",
              url: {
                notIn: curatedUrls,
              },
            }
          : {
              sourceType: "CURATED",
            },
      data: {
        isActive: false,
      },
    });

    deactivatedCount = deactivationResult.count;
  }

  return {
    upsertedCount: feeds.length,
    deactivatedCount,
    source,
    sourceCount: feeds.length,
    referenceUrl,
  };
};
