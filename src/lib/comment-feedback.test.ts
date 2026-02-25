import assert from "node:assert/strict";
import test from "node:test";

import { formatCommentPenaltyEndsAt, getCommentErrorFeedback, getCommentErrorMessage } from "./comment-feedback";

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

test("returns warning copy for first constitutional violation without suspension", () => {
  const message = getCommentErrorMessage({
    commentError: "constitution-violation",
    violationCount: 1,
  });

  assert.ok(message);
  assert.match(message as string, /warning with no suspension/i);
  assert.match(message as string, /violation #1/);
});

test("returns constitution link label for suspended moderation messages", () => {
  const feedback = getCommentErrorFeedback({
    commentError: "comment-suspended",
    suspendedUntilIso: "2026-02-25T17:12:00.000Z",
  });

  assert.ok(feedback);
  assert.equal(feedback?.constitutionLinkLabel, "Re-read the constitution before posting again.");
});
