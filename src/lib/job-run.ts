import { prisma } from "@/lib/prisma";

export const withTrackedJob = async <T extends { itemsProcessed?: number; itemsCreated?: number }>(
  jobType: string,
  handler: () => Promise<T>,
): Promise<T> => {
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

    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown job failure";

    await prisma.jobRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        notes: message,
      },
    });

    throw error;
  }
};
