import { NextResponse, type NextRequest } from "next/server";

import { isCronAuthorized } from "@/lib/cron-auth";
import { withTrackedJob } from "@/lib/job-run";
import { processPendingSummaries } from "@/lib/summary-job";

const DEFAULT_SUMMARY_BATCH_SIZE = 12;
const MAX_SUMMARY_BATCH_SIZE = 60;

const parseBatchSize = (request: NextRequest): number => {
  const rawBatchSize = request.nextUrl.searchParams.get("batch");
  if (!rawBatchSize) {
    return DEFAULT_SUMMARY_BATCH_SIZE;
  }

  const parsed = Number.parseInt(rawBatchSize, 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_SUMMARY_BATCH_SIZE;
  }

  return Math.max(1, Math.min(MAX_SUMMARY_BATCH_SIZE, parsed));
};

const runSummaryJob = async (batchSize: number) => {
  return withTrackedJob("summary-job", async () => {
    const result = await processPendingSummaries(batchSize);
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

  const batchSize = parseBatchSize(request);
  const result = await runSummaryJob(batchSize);
  return NextResponse.json(result);
};

export const POST = GET;
