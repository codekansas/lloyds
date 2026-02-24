import { normalizeUrl } from "@/lib/url";

export const curatedFeedsGistId = "7e763397edfcb353da2b516c3d3ef4ba";
export const curatedFeedsGistUrl = `https://gist.github.com/codekansas/${curatedFeedsGistId}`;
const curatedFeedsGistApiUrl = `https://api.github.com/gists/${curatedFeedsGistId}`;
const preferredGistFilenames = ["lloyds_feeds.txt"] as const;

const successfulFetchCacheTtlMs = 24 * 60 * 60 * 1000;
const fallbackCacheTtlMs = 60 * 60 * 1000;

export type CuratedFeedSeed = {
  url: string;
};

type CachedCuratedFeeds = {
  feeds: CuratedFeedSeed[];
  fetchedAt: number;
  source: "gist" | "fallback";
};

type GistFileReference = {
  content?: string;
  rawUrl?: string;
};

let cachedCuratedFeeds: CachedCuratedFeeds | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const cacheTtlMsForSource = (source: CachedCuratedFeeds["source"]): number => {
  if (source === "gist") {
    return successfulFetchCacheTtlMs;
  }

  return fallbackCacheTtlMs;
};

const toGistFileReference = (value: unknown): GistFileReference | null => {
  if (!isRecord(value)) {
    return null;
  }

  const isTruncated = value.truncated === true;
  const content = !isTruncated && typeof value.content === "string" ? value.content : undefined;
  const rawUrl = typeof value.raw_url === "string" ? value.raw_url : undefined;

  if (!content && !rawUrl) {
    return null;
  }

  return {
    content,
    rawUrl,
  };
};

const getGistFileReference = (payload: unknown): GistFileReference | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const filesValue = payload.files;
  if (!isRecord(filesValue)) {
    return null;
  }

  for (const preferredGistFilename of preferredGistFilenames) {
    const preferred = toGistFileReference(filesValue[preferredGistFilename]);
    if (preferred) {
      return preferred;
    }
  }

  for (const file of Object.values(filesValue)) {
    const fallback = toGistFileReference(file);
    if (fallback) {
      return fallback;
    }
  }

  return null;
};

const loadGistFileContent = async (fileReference: GistFileReference): Promise<string> => {
  if (fileReference.content !== undefined) {
    return fileReference.content;
  }

  if (!fileReference.rawUrl) {
    throw new Error("Gist file has no content or raw URL.");
  }

  const response = await fetch(fileReference.rawUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch raw feed file: ${response.status}`);
  }

  return response.text();
};

const normalizeCuratedFeedEntry = (value: unknown): CuratedFeedSeed | null => {
  const rawUrl =
    typeof value === "string"
      ? value.trim()
      : isRecord(value) && typeof value.url === "string"
        ? value.url.trim()
        : "";

  if (!rawUrl) {
    return null;
  }

  let normalizedUrl: string;

  try {
    normalizedUrl = normalizeUrl(rawUrl);
  } catch {
    return null;
  }

  return {
    url: normalizedUrl,
  };
};

const dedupeAndSortCuratedFeeds = (entries: Iterable<unknown>): CuratedFeedSeed[] => {
  const dedupedFeeds = new Map<string, CuratedFeedSeed>();

  for (const entry of entries) {
    const normalized = normalizeCuratedFeedEntry(entry);
    if (!normalized) {
      continue;
    }

    if (!dedupedFeeds.has(normalized.url)) {
      dedupedFeeds.set(normalized.url, normalized);
    }
  }

  return Array.from(dedupedFeeds.values()).sort((feedA, feedB) => feedA.url.localeCompare(feedB.url));
};

const parseLineBasedCuratedFeeds = (
  rawContent: string,
): {
  feeds: CuratedFeedSeed[];
  candidateLineCount: number;
} => {
  const candidateLines = rawContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  return {
    feeds: dedupeAndSortCuratedFeeds(candidateLines),
    candidateLineCount: candidateLines.length,
  };
};

export const parseCuratedFeedSeeds = (rawContent: string): CuratedFeedSeed[] => {
  const { feeds: lineBasedFeeds, candidateLineCount } = parseLineBasedCuratedFeeds(rawContent);
  if (lineBasedFeeds.length > 0 || candidateLineCount === 0) {
    return lineBasedFeeds;
  }

  throw new Error("Curated feeds gist must be a line-delimited URL list (one feed URL per line).");
};

const fetchCuratedFeedsFromGist = async (): Promise<CuratedFeedSeed[]> => {
  const response = await fetch(curatedFeedsGistApiUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "lloyds-feed-bot",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch curated feeds gist: ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const fileReference = getGistFileReference(payload);

  if (!fileReference) {
    throw new Error("Curated feeds gist had no readable file content.");
  }

  const rawContent = await loadGistFileContent(fileReference);
  return parseCuratedFeedSeeds(rawContent);
};

export const getCuratedFeedSeeds = async (): Promise<{
  feeds: CuratedFeedSeed[];
  source: "gist" | "fallback";
  referenceUrl: string;
}> => {
  const now = Date.now();

  if (cachedCuratedFeeds && now - cachedCuratedFeeds.fetchedAt < cacheTtlMsForSource(cachedCuratedFeeds.source)) {
    return {
      feeds: cachedCuratedFeeds.feeds,
      source: cachedCuratedFeeds.source,
      referenceUrl: curatedFeedsGistUrl,
    };
  }

  try {
    const feeds = await fetchCuratedFeedsFromGist();
    cachedCuratedFeeds = {
      feeds,
      fetchedAt: now,
      source: "gist",
    };

    return {
      feeds,
      source: "gist",
      referenceUrl: curatedFeedsGistUrl,
    };
  } catch {
    const fallbackFeeds = cachedCuratedFeeds?.feeds ?? [];
    cachedCuratedFeeds = {
      feeds: fallbackFeeds,
      fetchedAt: now,
      source: "fallback",
    };

    return {
      feeds: fallbackFeeds,
      source: "fallback",
      referenceUrl: curatedFeedsGistUrl,
    };
  }
};
