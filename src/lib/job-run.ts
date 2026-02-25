import { prisma } from "@/lib/prisma";
import { formatErrorSummary, getErrorDiagnostics, logEvent } from "@/lib/observability";

export const withTrackedJob = async <T extends { itemsProcessed?: number; itemsCreated?: number }>(
  jobType: string,
  handler: () => Promise<T>,
): Promise<T> => {
  const startedAtMs = Date.now();
  logEvent("info", "jobs.run.started", {
    jobType,
  });

  const run = await prisma.jobRun.create({
    data: {
      jobType,
      status: "RUNNING",
    },
  });

  try {
    const result = await handler();

    await prisma.jobRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        itemsProcessed: result.itemsProcessed ?? 0,
        itemsCreated: result.itemsCreated ?? 0,
      },
    });

    logEvent("info", "jobs.run.succeeded", {
      jobType,
      runId: run.id,
      durationMs: Date.now() - startedAtMs,
      itemsProcessed: result.itemsProcessed ?? 0,
      itemsCreated: result.itemsCreated ?? 0,
    });

    return result;
  } catch (error: unknown) {
    const note = formatErrorSummary(error, 900);

    await prisma.jobRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        notes: note,
      },
    });

    logEvent("error", "jobs.run.failed", {
      jobType,
      runId: run.id,
      durationMs: Date.now() - startedAtMs,
      error: getErrorDiagnostics(error),
    });

    throw error;
  }
};
