import assert from "node:assert/strict";
import test from "node:test";

import { resolvePenaltyForViolationCount } from "./comment-moderation-policy";

test("escalates comment penalties on repeated violations", () => {
  assert.deepEqual(resolvePenaltyForViolationCount(1), {
    penalty: "SUSPEND_12_HOURS",
    suspensionHours: 12,
  });
  assert.deepEqual(resolvePenaltyForViolationCount(2), {
    penalty: "SUSPEND_3_DAYS",
    suspensionHours: 72,
  });
  assert.deepEqual(resolvePenaltyForViolationCount(3), {
    penalty: "SUSPEND_7_DAYS",
    suspensionHours: 168,
  });
  assert.deepEqual(resolvePenaltyForViolationCount(4), {
    penalty: "SUSPEND_30_DAYS",
    suspensionHours: 720,
  });
  assert.deepEqual(resolvePenaltyForViolationCount(5), {
    penalty: "BAN_ACCOUNT",
    suspensionHours: null,
  });
});

test("normalizes invalid violation counts to first-tier suspension", () => {
  assert.deepEqual(resolvePenaltyForViolationCount(0), {
    penalty: "SUSPEND_12_HOURS",
    suspensionHours: 12,
  });
  assert.deepEqual(resolvePenaltyForViolationCount(-12), {
    penalty: "SUSPEND_12_HOURS",
    suspensionHours: 12,
  });
});
