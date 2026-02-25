import type { CommentModerationPenalty } from "@prisma/client";

type PenaltyScheduleEntry = {
  maxViolationCount: number;
  penalty: CommentModerationPenalty;
  suspensionHours: number | null;
};

const penaltySchedule: readonly PenaltyScheduleEntry[] = [
  {
    maxViolationCount: 1,
    penalty: "NONE",
    suspensionHours: null,
  },
  {
    maxViolationCount: 2,
    penalty: "SUSPEND_12_HOURS",
    suspensionHours: 12,
  },
  {
    maxViolationCount: 3,
    penalty: "SUSPEND_3_DAYS",
    suspensionHours: 72,
  },
  {
    maxViolationCount: 4,
    penalty: "SUSPEND_7_DAYS",
    suspensionHours: 7 * 24,
  },
  {
    maxViolationCount: 5,
    penalty: "SUSPEND_30_DAYS",
    suspensionHours: 30 * 24,
  },
  {
    maxViolationCount: Number.POSITIVE_INFINITY,
    penalty: "BAN_ACCOUNT",
    suspensionHours: null,
  },
];

const violationCooldownMs = 7 * 24 * 60 * 60 * 1_000;

const normalizeViolationCount = (violationCount: number): number => {
  if (!Number.isFinite(violationCount)) {
    return 0;
  }

  return Math.max(0, Math.floor(violationCount));
};

export const resolveEffectiveViolationCount = ({
  storedViolationCount,
  lastViolationAt,
  asOf = new Date(),
}: {
  storedViolationCount: number;
  lastViolationAt: Date | null;
  asOf?: Date;
}): number => {
  const normalizedCount = normalizeViolationCount(storedViolationCount);
  if (normalizedCount === 0) {
    return 0;
  }

  if (!lastViolationAt) {
    return 0;
  }

  const cooldownElapsed = asOf.valueOf() - lastViolationAt.valueOf() >= violationCooldownMs;
  return cooldownElapsed ? 0 : normalizedCount;
};

export const resolvePenaltyForViolationCount = (
  violationCount: number,
): {
  penalty: CommentModerationPenalty;
  suspensionHours: number | null;
} => {
  const normalizedCount = Math.max(1, normalizeViolationCount(violationCount));
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
