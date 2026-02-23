import type { CommentModerationPenalty } from "@prisma/client";

type PenaltyScheduleEntry = {
  maxViolationCount: number;
  penalty: CommentModerationPenalty;
  suspensionHours: number | null;
};

const penaltySchedule: readonly PenaltyScheduleEntry[] = [
  {
    maxViolationCount: 1,
    penalty: "SUSPEND_12_HOURS",
    suspensionHours: 12,
  },
  {
    maxViolationCount: 2,
    penalty: "SUSPEND_3_DAYS",
    suspensionHours: 72,
  },
  {
    maxViolationCount: 3,
    penalty: "SUSPEND_7_DAYS",
    suspensionHours: 7 * 24,
  },
  {
    maxViolationCount: 4,
    penalty: "SUSPEND_30_DAYS",
    suspensionHours: 30 * 24,
  },
  {
    maxViolationCount: Number.POSITIVE_INFINITY,
    penalty: "BAN_ACCOUNT",
    suspensionHours: null,
  },
];

export const resolvePenaltyForViolationCount = (
  violationCount: number,
): {
  penalty: CommentModerationPenalty;
  suspensionHours: number | null;
} => {
  const normalizedCount = Math.max(1, Math.floor(violationCount));
  const entry = penaltySchedule.find((step) => normalizedCount <= step.maxViolationCount) ?? penaltySchedule.at(-1);

  if (!entry) {
    return {
      penalty: "BAN_ACCOUNT",
      suspensionHours: null,
    };
  }

  return {
    penalty: entry.penalty,
    suspensionHours: entry.suspensionHours,
  };
};
