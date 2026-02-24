import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export type ServiceState = "operational" | "degraded" | "outage";

export type ServiceCheck = {
  id: string;
  state: ServiceState;
  message: string;
};

export type ServiceStatus = {
  id: "database" | "rss-ingestion" | "post-summarization" | "openai-config";
  name: string;
  state: ServiceState;
  summary: string;
  checks: ServiceCheck[];
  details: string[];
  staleSources?: RssStaleSource[];
  updatedAt: string;
};

export type RssStaleSource = {
  name: string;
  url: string;
  lastFetchedAt: string | null;
  staleAgeMinutes: number | null;
  failureCount: number;
};

export type ServiceStatusSnapshot = {
  generatedAt: string;
  overallState: ServiceState;
  services: ServiceStatus[];
  summaryQueue: {
    pendingCount: number | null;
    failedCount: number | null;
    oldestPendingAt: string | null;
    oldestPendingAgeMinutes: number | null;
  };
};

type JobRunSnapshot = {
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  itemsProcessed: number;
  itemsCreated: number;
  notes: string | null;
};

const stateRank: Record<ServiceState, number> = {
  operational: 0,
  degraded: 1,
  outage: 2,
};

const SUMMARY_JOB_INTERVAL_MINUTES = 10;
const RSS_JOB_INTERVAL_MINUTES = 60;
const SUMMARY_RUN_HISTORY_COUNT = 12;
const SUMMARY_PENDING_WARN_AGE_MINUTES = 20;
const SUMMARY_PENDING_OUTAGE_AGE_MINUTES = 120;
const SUMMARY_PENDING_WARN_COUNT_FLOOR = 12;
const SUMMARY_PENDING_OUTAGE_COUNT_FLOOR = 40;
const RUN_FAILURE_RATIO_WINDOW = 6;
const FEED_STALE_MINUTES = 6 * 60;
const FEED_STALE_WARN_RATIO = 0.18;
const FEED_STALE_OUTAGE_RATIO = 0.45;
const FEED_FAILURE_WARN_RATIO = 0.15;
const FEED_FAILURE_OUTAGE_RATIO = 0.4;
const DATABASE_WARN_QUERY_MS = 1_500;
const DATABASE_OUTAGE_QUERY_MS = 8_000;
const OPENAI_RECENT_SAMPLE_MIN = 8;
const OPENAI_FALLBACK_RATIO_WARN = 0.45;
const OPENAI_FALLBACK_RATIO_HIGH = 0.85;

export const serviceStateLabels: Record<ServiceState, string> = {
  operational: "Operational",
  degraded: "Degraded",
  outage: "Outage",
};

const defaultSummaryQueue = {
  pendingCount: null,
  failedCount: null,
  oldestPendingAt: null,
  oldestPendingAgeMinutes: null,
};

const pickWorseState = (left: ServiceState, right: ServiceState): ServiceState => {
  return stateRank[left] >= stateRank[right] ? left : right;
};

const toIsoOrNull = (value: Date | null): string | null => {
  return value ? value.toISOString() : null;
};

const minutesSince = (from: Date, now: Date): number => {
  const delta = now.valueOf() - from.valueOf();
  return Math.max(0, Math.floor(delta / 60_000));
};

const minutesSinceOrNull = (from: Date | null, now: Date): number | null => {
  if (!from) {
    return null;
  }

  return minutesSince(from, now);
};

export const formatMinutesAsAge = (minutes: number | null): string => {
  if (minutes === null) {
    return "unknown";
  }

  if (minutes < 1) {
    return "<1m";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
};

const formatPercent = (value: number): string => {
  return `${Math.round(value * 100)}%`;
};

const getJobMoment = (job: JobRunSnapshot | null): Date | null => {
  if (!job) {
    return null;
  }

  return job.finishedAt ?? job.startedAt;
};

const formatJobLine = (label: string, run: JobRunSnapshot | null, now: Date): string => {
  if (!run) {
    return `${label}: none recorded`;
  }

  const ageMinutes = minutesSinceOrNull(getJobMoment(run), now);
  return `${label}: ${run.status.toLowerCase()} ${formatMinutesAsAge(ageMinutes)} ago`;
};

const findLatestRun = (runs: JobRunSnapshot[], statuses?: string[]): JobRunSnapshot | null => {
  if (!statuses) {
    return runs[0] ?? null;
  }

  for (const run of runs) {
    if (statuses.includes(run.status)) {
      return run;
    }
  }

  return null;
};

const countConsecutiveFailures = (runs: JobRunSnapshot[]): number => {
  let consecutiveFailures = 0;

  for (const run of runs) {
    if (run.status === "RUNNING" && consecutiveFailures === 0) {
      continue;
    }

    if (run.status === "FAILED") {
      consecutiveFailures += 1;
      continue;
    }

    break;
  }

  return consecutiveFailures;
};

const computeFailureRate = (runs: JobRunSnapshot[], windowSize: number): number | null => {
  const settledRuns = runs
    .filter((run) => run.status === "SUCCESS" || run.status === "FAILED")
    .slice(0, windowSize);

  if (settledRuns.length < 3) {
    return null;
  }

  const failedRuns = settledRuns.filter((run) => run.status === "FAILED").length;
  return failedRuns / settledRuns.length;
};

const deriveServiceState = (checks: ServiceCheck[]): ServiceState => {
  return checks.reduce<ServiceState>((state, check) => pickWorseState(state, check.state), "operational");
};

const deriveServiceSummary = (checks: ServiceCheck[], healthySummary: string): string => {
  const nonOperationalChecks = checks.filter((check) => check.state !== "operational");
  if (nonOperationalChecks.length === 0) {
    return healthySummary;
  }

  const sortedChecks = [...nonOperationalChecks].sort((left, right) => stateRank[right.state] - stateRank[left.state]);
  return sortedChecks[0].message;
};

const formatCheckLine = (check: ServiceCheck): string => {
  return `${serviceStateLabels[check.state]} check: ${check.message}`;
};

const buildCommonJobChecks = ({
  runs,
  now,
  expectedIntervalMinutes,
  jobLabel,
}: {
  runs: JobRunSnapshot[];
  now: Date;
  expectedIntervalMinutes: number;
  jobLabel: string;
}): {
  checks: ServiceCheck[];
  latestRun: JobRunSnapshot | null;
  latestSuccess: JobRunSnapshot | null;
  latestFailure: JobRunSnapshot | null;
  failureRate: number | null;
  consecutiveFailures: number;
} => {
  const checks: ServiceCheck[] = [];
  const latestRun = findLatestRun(runs);
  const latestSuccess = findLatestRun(runs, ["SUCCESS"]);
  const latestFailure = findLatestRun(runs, ["FAILED"]);

  if (!latestRun) {
    checks.push({
      id: `${jobLabel}-never-ran`,
      state: "degraded",
      message: `No ${jobLabel} runs are recorded yet.`,
    });
  }

  const latestSuccessAgeMinutes = minutesSinceOrNull(getJobMoment(latestSuccess), now);
  const staleWarnThreshold = expectedIntervalMinutes * 3;
  const staleOutageThreshold = expectedIntervalMinutes * 9;

  if (latestSuccessAgeMinutes === null) {
    if (latestRun) {
      checks.push({
        id: `${jobLabel}-no-success`,
        state: "degraded",
        message: `${jobLabel} has never completed successfully.`,
      });
    }
  } else if (latestSuccessAgeMinutes > staleOutageThreshold) {
    checks.push({
      id: `${jobLabel}-stale-outage`,
      state: "outage",
      message: `${jobLabel} has no successful run for ${formatMinutesAsAge(latestSuccessAgeMinutes)}.`,
    });
  } else if (latestSuccessAgeMinutes > staleWarnThreshold) {
    checks.push({
      id: `${jobLabel}-stale-degraded`,
      state: "degraded",
      message: `${jobLabel} is stale (${formatMinutesAsAge(latestSuccessAgeMinutes)} since last success).`,
    });
  }

  const consecutiveFailures = countConsecutiveFailures(runs);
  if (consecutiveFailures >= 4) {
    checks.push({
      id: `${jobLabel}-failure-streak-outage`,
      state: "outage",
      message: `${jobLabel} has failed ${consecutiveFailures} runs in a row.`,
    });
  } else if (consecutiveFailures >= 2) {
    checks.push({
      id: `${jobLabel}-failure-streak-degraded`,
      state: "degraded",
      message: `${jobLabel} has failed ${consecutiveFailures} consecutive runs.`,
    });
  }

  const failureRate = computeFailureRate(runs, RUN_FAILURE_RATIO_WINDOW);
  if (failureRate !== null) {
    if (failureRate >= 0.75) {
      checks.push({
        id: `${jobLabel}-failure-rate-outage`,
        state: "outage",
        message: `${jobLabel} failure rate is ${formatPercent(failureRate)} across recent runs.`,
      });
    } else if (failureRate >= 0.4) {
      checks.push({
        id: `${jobLabel}-failure-rate-degraded`,
        state: "degraded",
        message: `${jobLabel} failure rate is elevated at ${formatPercent(failureRate)}.`,
      });
    }
  }

  const latestRunAgeMinutes = minutesSinceOrNull(getJobMoment(latestRun), now);
  if (latestRun?.status === "RUNNING" && latestRunAgeMinutes !== null) {
    const runningWarnThreshold = expectedIntervalMinutes * 2;
    const runningOutageThreshold = expectedIntervalMinutes * 4;

    if (latestRunAgeMinutes >= runningOutageThreshold) {
      checks.push({
        id: `${jobLabel}-running-outage`,
        state: "outage",
        message: `${jobLabel} has been running for ${formatMinutesAsAge(latestRunAgeMinutes)}.`,
      });
    } else if (latestRunAgeMinutes >= runningWarnThreshold) {
      checks.push({
        id: `${jobLabel}-running-degraded`,
        state: "degraded",
        message: `${jobLabel} has been running for ${formatMinutesAsAge(latestRunAgeMinutes)}.`,
      });
    }
  }

  return {
    checks,
    latestRun,
    latestSuccess,
    latestFailure,
    failureRate,
    consecutiveFailures,
  };
};

const buildDatabaseService = ({ nowIso, queryDurationMs }: { nowIso: string; queryDurationMs: number }): ServiceStatus => {
  const checks: ServiceCheck[] = [];

  if (queryDurationMs >= DATABASE_OUTAGE_QUERY_MS) {
    checks.push({
      id: "database-latency-outage",
      state: "outage",
      message: `Database status queries are timing out (${queryDurationMs}ms).`,
    });
  } else if (queryDurationMs >= DATABASE_WARN_QUERY_MS) {
    checks.push({
      id: "database-latency-degraded",
      state: "degraded",
      message: `Database status queries are slow (${queryDurationMs}ms).`,
    });
  }

  const healthySummary = "Prisma status queries are succeeding against PostgreSQL.";
  const state = deriveServiceState(checks);
  const summary = deriveServiceSummary(checks, healthySummary);
  const details = [`Snapshot query duration: ${queryDurationMs}ms`, ...checks.map(formatCheckLine)];

  return {
    id: "database",
    name: "Database",
    state,
    summary,
    checks,
    details,
    updatedAt: nowIso,
  };
};

const buildOpenAiService = ({
  nowIso,
  recentCompletedSummaries,
  recentFallbackSummaries,
}: {
  nowIso: string;
  recentCompletedSummaries: number | null;
  recentFallbackSummaries: number | null;
}): ServiceStatus => {
  const checks: ServiceCheck[] = [];

  if (!env.openAiApiKey) {
    checks.push({
      id: "openai-missing-key",
      state: "degraded",
      message: "OpenAI API credentials are missing; summaries are using fallback extraction.",
    });
  }

  if (recentCompletedSummaries !== null && recentFallbackSummaries !== null && recentCompletedSummaries >= OPENAI_RECENT_SAMPLE_MIN) {
    const fallbackRatio = recentFallbackSummaries / Math.max(1, recentCompletedSummaries);
    if (fallbackRatio >= OPENAI_FALLBACK_RATIO_HIGH) {
      checks.push({
        id: "openai-fallback-high",
        state: "degraded",
        message: `Most recent summaries are fallback-generated (${formatPercent(fallbackRatio)}).`,
      });
    } else if (fallbackRatio >= OPENAI_FALLBACK_RATIO_WARN) {
      checks.push({
        id: "openai-fallback-elevated",
        state: "degraded",
        message: `Fallback summary usage is elevated (${formatPercent(fallbackRatio)} in the last 24h).`,
      });
    }
  }

  const healthySummary = "OpenAI summarization is configured and usage patterns look healthy.";
  const state = deriveServiceState(checks);
  const summary = deriveServiceSummary(checks, healthySummary);
  const details = [
    `Configured model: ${env.openAiModel}`,
    recentCompletedSummaries === null ? "Recent summary usage: unavailable" : `Recent completed summaries (24h): ${recentCompletedSummaries}`,
    recentFallbackSummaries === null ? "Recent fallback summaries: unavailable" : `Recent fallback summaries (24h): ${recentFallbackSummaries}`,
    ...checks.map(formatCheckLine),
  ];

  return {
    id: "openai-config",
    name: "OpenAI summarization",
    state,
    summary,
    checks,
    details,
    updatedAt: nowIso,
  };
};

const buildSummaryService = ({
  now,
  pendingCount,
  failedCount,
  pendingOlderWarnCount,
  pendingOlderOutageCount,
  recentPostsCreatedLastHour,
  recentSummariesCompletedLastHour,
  summaryRuns,
}: {
  now: Date;
  pendingCount: number;
  failedCount: number;
  pendingOlderWarnCount: number;
  pendingOlderOutageCount: number;
  recentPostsCreatedLastHour: number;
  recentSummariesCompletedLastHour: number;
  summaryRuns: JobRunSnapshot[];
}): ServiceStatus => {
  const checks: ServiceCheck[] = [];
  const runSignals = buildCommonJobChecks({
    runs: summaryRuns,
    now,
    expectedIntervalMinutes: SUMMARY_JOB_INTERVAL_MINUTES,
    jobLabel: "summary job",
  });

  checks.push(...runSignals.checks);

  const dynamicWarnQueue = Math.max(SUMMARY_PENDING_WARN_COUNT_FLOOR, recentPostsCreatedLastHour * 2);
  const dynamicOutageQueue = Math.max(SUMMARY_PENDING_OUTAGE_COUNT_FLOOR, recentPostsCreatedLastHour * 4);

  if (pendingCount >= dynamicOutageQueue && pendingOlderWarnCount > 0) {
    checks.push({
      id: "summary-queue-outage",
      state: "outage",
      message: `Summary backlog is overloaded (${pendingCount} pending).`,
    });
  } else if (pendingCount >= dynamicWarnQueue) {
    checks.push({
      id: "summary-queue-degraded",
      state: "degraded",
      message: `Summary backlog is elevated (${pendingCount} pending).`,
    });
  }

  if (pendingOlderOutageCount > 0) {
    checks.push({
      id: "summary-aged-pending-outage",
      state: "outage",
      message: `${pendingOlderOutageCount} summaries have waited over ${SUMMARY_PENDING_OUTAGE_AGE_MINUTES} minutes.`,
    });
  } else if (pendingOlderWarnCount > 0) {
    checks.push({
      id: "summary-aged-pending-degraded",
      state: "degraded",
      message: `${pendingOlderWarnCount} summaries have waited over ${SUMMARY_PENDING_WARN_AGE_MINUTES} minutes.`,
    });
  }

  if (pendingCount > 0 && recentSummariesCompletedLastHour === 0) {
    checks.push({
      id: "summary-zero-throughput",
      state: pendingOlderWarnCount > 0 ? "outage" : "degraded",
      message: "Summary pipeline has pending work but no completions in the last hour.",
    });
  } else if (
    pendingCount > 0 &&
    recentPostsCreatedLastHour > recentSummariesCompletedLastHour * 2 &&
    pendingOlderWarnCount > 0
  ) {
    checks.push({
      id: "summary-throughput-pressure",
      state: "degraded",
      message: "Summary throughput is lagging behind incoming posts.",
    });
  }

  if (runSignals.latestSuccess === null && pendingCount > 0) {
    checks.push({
      id: "summary-no-success-with-pending",
      state: pendingOlderWarnCount > 0 ? "outage" : "degraded",
      message: "Pending summaries exist before any successful summary run has completed.",
    });
  }

  const healthySummary = "Summary workers are keeping up with incoming posts.";
  const state = deriveServiceState(checks);
  const summary = deriveServiceSummary(checks, healthySummary);

  const failureRateDetail =
    runSignals.failureRate === null ? "Recent summary failure rate: insufficient data" : `Recent summary failure rate: ${formatPercent(runSignals.failureRate)}`;

  const details = [
    `Pending summaries: ${pendingCount}`,
    `Failed summaries: ${failedCount}`,
    `Pending older than ${SUMMARY_PENDING_WARN_AGE_MINUTES}m: ${pendingOlderWarnCount}`,
    `Pending older than ${SUMMARY_PENDING_OUTAGE_AGE_MINUTES}m: ${pendingOlderOutageCount}`,
    `New posts in last hour: ${recentPostsCreatedLastHour}`,
    `Summaries completed in last hour: ${recentSummariesCompletedLastHour}`,
    `Consecutive summary-job failures: ${runSignals.consecutiveFailures}`,
    failureRateDetail,
    formatJobLine("Latest run", runSignals.latestRun, now),
    formatJobLine("Latest success", runSignals.latestSuccess, now),
    ...checks.filter((check) => check.state !== "operational").map(formatCheckLine),
  ];

  if (runSignals.latestFailure?.notes) {
    details.push(`Latest failure note: ${runSignals.latestFailure.notes.slice(0, 220)}`);
  }

  return {
    id: "post-summarization",
    name: "Post summarization",
    state,
    summary,
    checks,
    details,
    updatedAt: (getJobMoment(runSignals.latestRun) ?? now).toISOString(),
  };
};

const buildRssService = ({
  now,
  activeSourceCount,
  staleSourceCount,
  staleSources,
  unstableSourceCount,
  rssRuns,
}: {
  now: Date;
  activeSourceCount: number;
  staleSourceCount: number;
  staleSources: RssStaleSource[];
  unstableSourceCount: number;
  rssRuns: JobRunSnapshot[];
}): ServiceStatus => {
  const checks: ServiceCheck[] = [];
  const runSignals = buildCommonJobChecks({
    runs: rssRuns,
    now,
    expectedIntervalMinutes: RSS_JOB_INTERVAL_MINUTES,
    jobLabel: "rss ingest",
  });

  checks.push(...runSignals.checks);

  if (activeSourceCount === 0) {
    checks.push({
      id: "rss-no-active-sources",
      state: "degraded",
      message: "No active feed sources are configured.",
    });
  }

  if (activeSourceCount > 0) {
    const staleRatio = staleSourceCount / activeSourceCount;
    if (staleRatio >= FEED_STALE_OUTAGE_RATIO) {
      checks.push({
        id: "rss-source-staleness-outage",
        state: "outage",
        message: `${formatPercent(staleRatio)} of feed sources have stale fetch timestamps.`,
      });
    } else if (staleRatio >= FEED_STALE_WARN_RATIO) {
      checks.push({
        id: "rss-source-staleness-degraded",
        state: "degraded",
        message: `${formatPercent(staleRatio)} of feed sources have stale fetch timestamps.`,
      });
    }

    const unstableRatio = unstableSourceCount / activeSourceCount;
    if (unstableRatio >= FEED_FAILURE_OUTAGE_RATIO) {
      checks.push({
        id: "rss-source-failures-outage",
        state: "outage",
        message: `${formatPercent(unstableRatio)} of feed sources are failing repeatedly.`,
      });
    } else if (unstableRatio >= FEED_FAILURE_WARN_RATIO) {
      checks.push({
        id: "rss-source-failures-degraded",
        state: "degraded",
        message: `${formatPercent(unstableRatio)} of feed sources are failing repeatedly.`,
      });
    }
  }

  if (runSignals.latestSuccess && activeSourceCount > 0 && runSignals.latestSuccess.itemsProcessed === 0) {
    checks.push({
      id: "rss-latest-success-no-sources",
      state: "degraded",
      message: "The latest successful RSS run processed zero sources.",
    });
  }

  const healthySummary = "RSS ingestion is running and source coverage looks healthy.";
  const state = deriveServiceState(checks);
  const summary = deriveServiceSummary(checks, healthySummary);

  const failureRateDetail =
    runSignals.failureRate === null ? "Recent RSS failure rate: insufficient data" : `Recent RSS failure rate: ${formatPercent(runSignals.failureRate)}`;

  const staleRatioDetail =
    activeSourceCount === 0 ? "Feed source staleness ratio: n/a" : `Feed source staleness ratio: ${formatPercent(staleSourceCount / activeSourceCount)}`;

  const details = [
    `Active feed sources: ${activeSourceCount}`,
    `Stale feed sources (> ${Math.floor(FEED_STALE_MINUTES / 60)}h): ${staleSourceCount}`,
    `Repeatedly failing feed sources (failureCount >= 3): ${unstableSourceCount}`,
    staleRatioDetail,
    `Consecutive rss-ingest failures: ${runSignals.consecutiveFailures}`,
    failureRateDetail,
    formatJobLine("Latest run", runSignals.latestRun, now),
    formatJobLine("Latest success", runSignals.latestSuccess, now),
    ...checks.filter((check) => check.state !== "operational").map(formatCheckLine),
  ];

  if (staleSources.length > 0) {
    details.push(`Stale source URLs listed below: ${staleSources.length}`);
  }

  if (runSignals.latestFailure?.notes) {
    details.push(`Latest failure note: ${runSignals.latestFailure.notes.slice(0, 220)}`);
  }

  return {
    id: "rss-ingestion",
    name: "RSS ingestion",
    state,
    summary,
    checks,
    details,
    staleSources,
    updatedAt: (getJobMoment(runSignals.latestRun) ?? now).toISOString(),
  };
};

export const getServiceStatusSnapshot = async (): Promise<ServiceStatusSnapshot> => {
  const now = new Date();
  const nowIso = now.toISOString();
  const oneHourAgo = new Date(now.valueOf() - 60 * 60_000);
  const twentyFourHoursAgo = new Date(now.valueOf() - 24 * 60 * 60_000);
  const summaryWarnCutoff = new Date(now.valueOf() - SUMMARY_PENDING_WARN_AGE_MINUTES * 60_000);
  const summaryOutageCutoff = new Date(now.valueOf() - SUMMARY_PENDING_OUTAGE_AGE_MINUTES * 60_000);
  const feedStaleCutoff = new Date(now.valueOf() - FEED_STALE_MINUTES * 60_000);

  try {
    const queryStartMs = Date.now();
    const [
      pendingSummaryCount,
      failedSummaryCount,
      oldestPendingSummary,
      pendingOlderWarnCount,
      pendingOlderOutageCount,
      recentPostsCreatedLastHour,
      recentSummariesCompletedLastHour,
      summaryRuns,
      rssRuns,
      activeFeedSourceCount,
      staleFeedSourcesRaw,
      staleFeedSourceCount,
      unstableFeedSourceCount,
      recentCompletedSummaries24h,
      recentFallbackSummaries24h,
    ] = await Promise.all([
      prisma.post.count({
        where: {
          summaryStatus: "PENDING",
        },
      }),
      prisma.post.count({
        where: {
          summaryStatus: "FAILED",
        },
      }),
      prisma.post.findFirst({
        where: {
          summaryStatus: "PENDING",
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          createdAt: true,
        },
      }),
      prisma.post.count({
        where: {
          summaryStatus: "PENDING",
          createdAt: {
            lt: summaryWarnCutoff,
          },
        },
      }),
      prisma.post.count({
        where: {
          summaryStatus: "PENDING",
          createdAt: {
            lt: summaryOutageCutoff,
          },
        },
      }),
      prisma.post.count({
        where: {
          createdAt: {
            gte: oneHourAgo,
          },
        },
      }),
      prisma.post.count({
        where: {
          summaryStatus: "COMPLETE",
          summaryGeneratedAt: {
            gte: oneHourAgo,
          },
        },
      }),
      prisma.jobRun.findMany({
        where: {
          jobType: "summary-job",
        },
        orderBy: {
          startedAt: "desc",
        },
        take: SUMMARY_RUN_HISTORY_COUNT,
        select: {
          status: true,
          startedAt: true,
          finishedAt: true,
          itemsProcessed: true,
          itemsCreated: true,
          notes: true,
        },
      }),
      prisma.jobRun.findMany({
        where: {
          jobType: "rss-ingest",
        },
        orderBy: {
          startedAt: "desc",
        },
        take: SUMMARY_RUN_HISTORY_COUNT,
        select: {
          status: true,
          startedAt: true,
          finishedAt: true,
          itemsProcessed: true,
          itemsCreated: true,
          notes: true,
        },
      }),
      prisma.feedSource.count({
        where: {
          isActive: true,
        },
      }),
      prisma.feedSource.findMany({
        where: {
          isActive: true,
          OR: [
            {
              lastFetchedAt: null,
            },
            {
              lastFetchedAt: {
                lt: feedStaleCutoff,
              },
            },
          ],
        },
        select: {
          name: true,
          url: true,
          lastFetchedAt: true,
          failureCount: true,
        },
      }),
      prisma.feedSource.count({
        where: {
          isActive: true,
          OR: [
            {
              lastFetchedAt: null,
            },
            {
              lastFetchedAt: {
                lt: feedStaleCutoff,
              },
            },
          ],
        },
      }),
      prisma.feedSource.count({
        where: {
          isActive: true,
          failureCount: {
            gte: 3,
          },
        },
      }),
      prisma.post.count({
        where: {
          summaryStatus: "COMPLETE",
          summaryGeneratedAt: {
            gte: twentyFourHoursAgo,
          },
        },
      }),
      prisma.post.count({
        where: {
          summaryStatus: "COMPLETE",
          summaryGeneratedAt: {
            gte: twentyFourHoursAgo,
          },
          summaryModel: {
            startsWith: "fallback",
          },
        },
      }),
    ]);

    const staleFeedSources: RssStaleSource[] = staleFeedSourcesRaw
      .map((source) => ({
        name: source.name,
        url: source.url,
        lastFetchedAt: toIsoOrNull(source.lastFetchedAt),
        staleAgeMinutes: minutesSinceOrNull(source.lastFetchedAt, now),
        failureCount: source.failureCount,
      }))
      .sort((left, right) => {
        const leftAge = left.staleAgeMinutes ?? Number.POSITIVE_INFINITY;
        const rightAge = right.staleAgeMinutes ?? Number.POSITIVE_INFINITY;

        if (rightAge !== leftAge) {
          return rightAge - leftAge;
        }

        return left.url.localeCompare(right.url);
      });
    const queryDurationMs = Date.now() - queryStartMs;

    const databaseService = buildDatabaseService({
      nowIso,
      queryDurationMs,
    });

    const summaryService = buildSummaryService({
      now,
      pendingCount: pendingSummaryCount,
      failedCount: failedSummaryCount,
      pendingOlderWarnCount,
      pendingOlderOutageCount,
      recentPostsCreatedLastHour,
      recentSummariesCompletedLastHour,
      summaryRuns,
    });

    const rssService = buildRssService({
      now,
      activeSourceCount: activeFeedSourceCount,
      staleSourceCount: staleFeedSourceCount,
      staleSources: staleFeedSources,
      unstableSourceCount: unstableFeedSourceCount,
      rssRuns,
    });

    const openAiService = buildOpenAiService({
      nowIso,
      recentCompletedSummaries: recentCompletedSummaries24h,
      recentFallbackSummaries: recentFallbackSummaries24h,
    });

    const services: ServiceStatus[] = [databaseService, rssService, summaryService, openAiService];
    const overallState = services.reduce<ServiceState>((state, service) => pickWorseState(state, service.state), "operational");

    return {
      generatedAt: nowIso,
      overallState,
      services,
      summaryQueue: {
        pendingCount: pendingSummaryCount,
        failedCount: failedSummaryCount,
        oldestPendingAt: toIsoOrNull(oldestPendingSummary?.createdAt ?? null),
        oldestPendingAgeMinutes: minutesSinceOrNull(oldestPendingSummary?.createdAt ?? null, now),
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown database error";

    const databaseService: ServiceStatus = {
      id: "database",
      name: "Database",
      state: "outage",
      summary: "Status checks cannot reach PostgreSQL via Prisma.",
      checks: [
        {
          id: "database-unreachable",
          state: "outage",
          message,
        },
      ],
      details: [message],
      updatedAt: nowIso,
    };

    const rssService: ServiceStatus = {
      id: "rss-ingestion",
      name: "RSS ingestion",
      state: "outage",
      summary: "RSS ingest status is unavailable because the database is unreachable.",
      checks: [
        {
          id: "rss-status-unavailable",
          state: "outage",
          message: "Dependency unavailable: database",
        },
      ],
      details: [],
      staleSources: [],
      updatedAt: nowIso,
    };

    const summaryService: ServiceStatus = {
      id: "post-summarization",
      name: "Post summarization",
      state: "outage",
      summary: "Summary queue status is unavailable because the database is unreachable.",
      checks: [
        {
          id: "summary-status-unavailable",
          state: "outage",
          message: "Dependency unavailable: database",
        },
      ],
      details: [],
      updatedAt: nowIso,
    };

    const openAiService = buildOpenAiService({
      nowIso,
      recentCompletedSummaries: null,
      recentFallbackSummaries: null,
    });

    const services: ServiceStatus[] = [databaseService, rssService, summaryService, openAiService];
    const overallState = services.reduce<ServiceState>((state, service) => pickWorseState(state, service.state), "operational");

    return {
      generatedAt: nowIso,
      overallState,
      services,
      summaryQueue: defaultSummaryQueue,
    };
  }
};
