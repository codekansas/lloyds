import { Prisma } from "@prisma/client";

import { formatErrorSummary, getErrorDiagnostics, logEvent } from "@/lib/observability";
import { getCuratedFeedSeeds } from "@/lib/curated-feeds";
import { prisma } from "@/lib/prisma";
import { getDomainFromUrl } from "@/lib/url";

export type EnsureCuratedFeedSourcesResult = {
  upsertedCount: number;
  deactivatedCount: number;
  normalizedLegacyTypeCount: number;
  upsertErrorCount: number;
  upsertErrors: string[];
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

const normalizeLegacyFeedSourceTypes = async (): Promise<number> => {
  return prisma.$executeRaw`UPDATE "FeedSource" SET "sourceType" = 'CURATED' WHERE "sourceType"::text <> 'CURATED'`;
};

const ensureCuratedFeedSource = async ({ feedUrl, sourceName }: { feedUrl: string; sourceName: string }): Promise<void> => {
  const updateResult = await prisma.feedSource.updateMany({
    where: {
      url: feedUrl,
    },
    data: {
      name: sourceName,
      description: null,
      isActive: true,
      sourceType: "CURATED",
    },
  });

  if (updateResult.count > 0) {
    return;
  }

  try {
    await prisma.feedSource.create({
      data: {
        name: sourceName,
        url: feedUrl,
        description: null,
        sourceType: "CURATED",
        isActive: true,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await prisma.feedSource.updateMany({
        where: {
          url: feedUrl,
        },
        data: {
          name: sourceName,
          description: null,
          isActive: true,
          sourceType: "CURATED",
        },
      });
      return;
    }

    throw error;
  }
};

export const ensureCuratedFeedSources = async (): Promise<EnsureCuratedFeedSourcesResult> => {
  const { feeds, source, referenceUrl } = await getCuratedFeedSeeds();
  const upsertErrors: string[] = [];
  let upsertedCount = 0;
  let normalizedLegacyTypeCount = 0;

  try {
    normalizedLegacyTypeCount = await normalizeLegacyFeedSourceTypes();
    if (normalizedLegacyTypeCount > 0) {
      logEvent("warn", "rss.curated_sync.legacy_source_types_normalized", {
        normalizedLegacyTypeCount,
      });
    }
  } catch (error: unknown) {
    logEvent("warn", "rss.curated_sync.legacy_source_type_normalization_failed", {
      error: getErrorDiagnostics(error),
    });
  }

  for (const feed of feeds) {
    const sourceName = deriveSourceNameFromUrl(feed.url);

    try {
      await ensureCuratedFeedSource({
        feedUrl: feed.url,
        sourceName,
      });
      upsertedCount += 1;
    } catch (error: unknown) {
      upsertErrors.push(`${feed.url}: ${formatErrorSummary(error, 200)}`);
      logEvent("error", "rss.curated_sync.feed_upsert_failed", {
        feedUrl: feed.url,
        error: getErrorDiagnostics(error),
      });
    }
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

  logEvent("info", "rss.curated_sync.completed", {
    source,
    sourceCount: feeds.length,
    upsertedCount,
    upsertErrorCount: upsertErrors.length,
    deactivatedCount,
  });

  return {
    upsertedCount,
    deactivatedCount,
    normalizedLegacyTypeCount,
    upsertErrorCount: upsertErrors.length,
    upsertErrors: upsertErrors.slice(0, 6),
    source,
    sourceCount: feeds.length,
    referenceUrl,
  };
};
