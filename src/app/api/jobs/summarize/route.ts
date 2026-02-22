import { NextResponse, type NextRequest } from "next/server";

import { isCronAuthorized } from "@/lib/cron-auth";
import { withTrackedJob } from "@/lib/job-run";
import { processPendingSummaries } from "@/lib/summary-job";

const runSummaryJob = async () => {
  return withTrackedJob("summary-job", async () => {
    const result = await processPendingSummaries(12);
    return {
      ...result,
      itemsProcessed: result.processed,
      itemsCreated: result.completed,
    };
  });
};

export const GET = async (request: NextRequest) => {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSummaryJob();
  return NextResponse.json(result);
};

export const POST = GET;
