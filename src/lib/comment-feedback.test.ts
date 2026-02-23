import assert from "node:assert/strict";
import test from "node:test";

import { formatCommentPenaltyEndsAt, getCommentErrorMessage } from "./comment-feedback";

test("formats moderation suspension timestamps in UTC", () => {
  const formatted = formatCommentPenaltyEndsAt("2026-02-23T14:30:00.000Z");

  assert.equal(formatted, "2026-02-23 14:30 UTC");
});

test("returns null for invalid moderation timestamps", () => {
  const formatted = formatCommentPenaltyEndsAt("not-a-date");

  assert.equal(formatted, null);
});

test("includes suspension deadline and violation number in moderation error message", () => {
  const message = getCommentErrorMessage({
    commentError: "constitution-violation",
    suspendedUntilIso: "2026-02-24T18:00:00.000Z",
    violationCount: 2,
  });

  assert.ok(message);
  assert.match(message as string, /violation #2/);
  assert.match(message as string, /2026-02-24 18:00 UTC/);
});
