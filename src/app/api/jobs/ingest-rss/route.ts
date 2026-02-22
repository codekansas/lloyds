import { NextResponse, type NextRequest } from "next/server";

import { isCronAuthorized } from "@/lib/cron-auth";
import { withTrackedJob } from "@/lib/job-run";
import { ingestRssFeeds } from "@/lib/rss";
import { ensureCuratedFeedSources } from "@/lib/seed-curated";

const runIngestion = async () => {
  return withTrackedJob("rss-ingest", async () => {
    await ensureCuratedFeedSources();
    const result = await ingestRssFeeds();
    return {
      ...result,
      itemsProcessed: result.sourcesAttempted,
      itemsCreated: result.postsCreated,
    };
  });
};

export const GET = async (request: NextRequest) => {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runIngestion();
  return NextResponse.json(result);
};

export const POST = GET;
