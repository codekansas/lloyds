import assert from "node:assert/strict";
import test from "node:test";

import { resolveEffectiveViolationCount, resolvePenaltyForViolationCount } from "./comment-moderation-policy";

test("escalates comment penalties on repeated violations", () => {
  assert.deepEqual(resolvePenaltyForViolationCount(1), {
    penalty: "NONE",
    suspensionHours: null,
  });
  assert.deepEqual(resolvePenaltyForViolationCount(2), {
    penalty: "SUSPEND_12_HOURS",
    suspensionHours: 12,
  });
  assert.deepEqual(resolvePenaltyForViolationCount(3), {
    penalty: "SUSPEND_3_DAYS",
    suspensionHours: 72,
  });
  assert.deepEqual(resolvePenaltyForViolationCount(4), {
    penalty: "SUSPEND_7_DAYS",
    suspensionHours: 168,
  });
  assert.deepEqual(resolvePenaltyForViolationCount(5), {
    penalty: "SUSPEND_30_DAYS",
    suspensionHours: 720,
  });
  assert.deepEqual(resolvePenaltyForViolationCount(6), {
    penalty: "BAN_ACCOUNT",
    suspensionHours: null,
  });
});

test("normalizes invalid violation counts to first-tier warning", () => {
  assert.deepEqual(resolvePenaltyForViolationCount(0), {
    penalty: "NONE",
    suspensionHours: null,
  });
  assert.deepEqual(resolvePenaltyForViolationCount(-12), {
    penalty: "NONE",
    suspensionHours: null,
  });
});

test("resets violation streak after one week without violations", () => {
  const asOf = new Date("2026-02-25T18:00:00.000Z");

  assert.equal(
    resolveEffectiveViolationCount({
      storedViolationCount: 4,
      lastViolationAt: new Date("2026-02-18T18:00:00.000Z"),
      asOf,
    }),
    0,
  );
  assert.equal(
    resolveEffectiveViolationCount({
      storedViolationCount: 4,
      lastViolationAt: new Date("2026-02-19T18:00:01.000Z"),
      asOf,
    }),
    4,
  );
});

test("treats missing last violation as reset streak", () => {
  assert.equal(
    resolveEffectiveViolationCount({
      storedViolationCount: 3,
      lastViolationAt: null,
    }),
    0,
  );
});
