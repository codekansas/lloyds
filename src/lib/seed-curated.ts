import { getCuratedFeedSeeds } from "@/lib/curated-feeds";
import { prisma } from "@/lib/prisma";
import { getDomainFromUrl } from "@/lib/url";

export type EnsureCuratedFeedSourcesResult = {
  upsertedCount: number;
  deactivatedCount: number;
  source: "gist" | "fallback";
  sourceCount: number;
  referenceUrl: string;
};

const deriveSourceNameFromUrl = (url: string): string => {
  try {
    return getDomainFromUrl(url);
  } catch {
    return url;
  }
};

export const ensureCuratedFeedSources = async (): Promise<EnsureCuratedFeedSourcesResult> => {
  const { feeds, source, referenceUrl } = await getCuratedFeedSeeds();

  for (const feed of feeds) {
    const sourceName = deriveSourceNameFromUrl(feed.url);

    await prisma.feedSource.upsert({
      where: {
        url: feed.url,
      },
      update: {
        name: sourceName,
        description: null,
        isActive: true,
      },
      create: {
        name: sourceName,
        url: feed.url,
        description: null,
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
