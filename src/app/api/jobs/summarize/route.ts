import { NextResponse, type NextRequest } from "next/server";

import { isCronAuthorized } from "@/lib/cron-auth";
import { withTrackedJob } from "@/lib/job-run";
import { processPendingSummaries } from "@/lib/summary-job";

const DEFAULT_SUMMARY_BATCH_SIZE = 12;
const MAX_SUMMARY_BATCH_SIZE = 60;
const DEFAULT_SUMMARY_CONCURRENCY = 4;
const MAX_SUMMARY_CONCURRENCY = 12;

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

const parseConcurrency = (request: NextRequest): number => {
  const rawConcurrency = request.nextUrl.searchParams.get("concurrency");
  if (!rawConcurrency) {
    return DEFAULT_SUMMARY_CONCURRENCY;
  }

  const parsed = Number.parseInt(rawConcurrency, 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_SUMMARY_CONCURRENCY;
  }

  return Math.max(1, Math.min(MAX_SUMMARY_CONCURRENCY, parsed));
};

const runSummaryJob = async (batchSize: number, concurrency: number) => {
  return withTrackedJob("summary-job", async () => {
    const result = await processPendingSummaries(batchSize, concurrency);
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
  const concurrency = parseConcurrency(request);
  const result = await runSummaryJob(batchSize, concurrency);
  return NextResponse.json(result);
};

export const POST = GET;
