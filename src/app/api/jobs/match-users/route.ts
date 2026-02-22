import { NextResponse, type NextRequest } from "next/server";

import { isCronAuthorized } from "@/lib/cron-auth";
import { withTrackedJob } from "@/lib/job-run";
import { runMatchingBatch } from "@/lib/matching";

const runMatchingJob = async () => {
  return withTrackedJob("matching-job", async () => {
    const result = await runMatchingBatch(12);
    return {
      ...result,
      itemsProcessed: result.candidatesEvaluated,
      itemsCreated: result.matchesCreated,
    };
  });
};

export const GET = async (request: NextRequest) => {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runMatchingJob();
  return NextResponse.json(result);
};

export const POST = GET;
