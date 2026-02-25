import Parser from "rss-parser";

import { formatErrorSummary, getErrorDiagnostics, logEvent } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import { getDomainFromUrl, normalizeUrl } from "@/lib/url";

const parser = new Parser({
  timeout: 15_000,
});

const trimExcerpt = (raw: string | null | undefined): string | null => {
  if (!raw) {
    return null;
  }

  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return null;
  }

  return collapsed.slice(0, 560);
};

const parsePublishedDate = (rawDate: string | null | undefined): Date | null => {
  if (!rawDate) {
    return null;
  }

  const candidate = new Date(rawDate);
  if (Number.isNaN(candidate.valueOf())) {
    return null;
  }

  return candidate;
};

export type IngestRssResult = {
  sourcesAttempted: number;
  sourcesSucceeded: number;
  postsCreated: number;
  postsSkipped: number;
  errors: string[];
};

export const ingestRssFeeds = async (
  maxSources = 25,
  maxItemsPerSource = 30,
): Promise<IngestRssResult> => {
  const startedAtMs = Date.now();
  const sources = await prisma.feedSource.findMany({
    where: {
      isActive: true,
      sourceType: "CURATED",
    },
    take: maxSources,
    // Prioritize never-fetched sources so they do not starve when maxSources < total active sources.
    orderBy: [
      {
        lastFetchedAt: {
          sort: "asc",
          nulls: "first",
        },
      },
      { createdAt: "asc" },
    ],
  });

  const result: IngestRssResult = {
    sourcesAttempted: sources.length,
    sourcesSucceeded: 0,
    postsCreated: 0,
    postsSkipped: 0,
    errors: [],
  };

  for (const source of sources) {
    try {
      const feed = await parser.parseURL(source.url);
      const limitedItems = (feed.items ?? []).slice(0, maxItemsPerSource);
      for (const item of limitedItems) {
        const itemUrl = item.link?.trim();
        const title = item.title?.trim();

        if (!itemUrl || !title) {
          result.postsSkipped += 1;
          continue;
        }

        let canonicalUrl: string;
        let domain: string;

        try {
          canonicalUrl = normalizeUrl(itemUrl);
          domain = getDomainFromUrl(canonicalUrl);
        } catch {
          result.postsSkipped += 1;
          continue;
        }

        const existing = await prisma.post.findUnique({
          where: {
            canonicalUrl,
          },
          select: {
            id: true,
          },
        });

        if (existing) {
          result.postsSkipped += 1;
          continue;
        }

        await prisma.post.create({
          data: {
            title,
            url: itemUrl,
            canonicalUrl,
            domain,
            excerpt: trimExcerpt(item.contentSnippet ?? item.content ?? item.summary),
            publishedAt: parsePublishedDate(item.isoDate ?? item.pubDate),
            sourceType: "CURATED_RSS",
            feedSourceId: source.id,
            submittedById: null,
            summaryStatus: "PENDING",
          },
        });

        result.postsCreated += 1;
      }

      result.sourcesSucceeded += 1;
      await prisma.feedSource.update({
        where: {
          id: source.id,
        },
        data: {
          lastFetchedAt: new Date(),
          failureCount: 0,
        },
      });
    } catch (error: unknown) {
      const message = formatErrorSummary(error, 220);
      result.errors.push(`${source.name}: ${message}`);
      logEvent("warn", "rss.ingest.source_failed", {
        sourceId: source.id,
        sourceName: source.name,
        sourceUrl: source.url,
        error: getErrorDiagnostics(error),
      });

      await prisma.feedSource.update({
        where: {
          id: source.id,
        },
        data: {
          failureCount: {
            increment: 1,
          },
          lastFetchedAt: new Date(),
        },
      });
    }
  }

  logEvent("info", "rss.ingest.completed", {
    durationMs: Date.now() - startedAtMs,
    sourcesAttempted: result.sourcesAttempted,
    sourcesSucceeded: result.sourcesSucceeded,
    postsCreated: result.postsCreated,
    postsSkipped: result.postsSkipped,
    errorCount: result.errors.length,
  });

  return result;
};
