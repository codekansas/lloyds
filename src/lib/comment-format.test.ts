import assert from "node:assert/strict";
import test from "node:test";

import { extractCommentReferenceNumbers, renderCommentBodyHtml } from "./comment-format";

test("extracts comment references from ! style", () => {
  const references = extractCommentReferenceNumbers("See !2 and !2 again before !3.");

  assert.deepEqual(references, [2, 3]);
});

test("ignores legacy >> comment references", () => {
  const references = extractCommentReferenceNumbers("Legacy >>1 should not count, but !2 should.");

  assert.deepEqual(references, [2]);
});

test("renders markdown comment references as local hash links", () => {
  const rendered = renderCommentBodyHtml({
    content: "Cross-reference !2 and !1.",
    format: "MARKDOWN",
    commentIdByNumber: new Map([
      [1, "alpha"],
      [2, "beta"],
    ]),
  });

  assert.match(rendered, /href="#comment-beta"/);
  assert.match(rendered, /href="#comment-alpha"/);
  assert.match(rendered, /!2/);
  assert.match(rendered, /!1/);
  assert.doesNotMatch(rendered, /target="_blank"/);
});

test("sanitizes unsafe markdown links", () => {
  const rendered = renderCommentBodyHtml({
    content: "[do not open](javascript:alert('xss'))",
    format: "MARKDOWN",
  });

  assert.doesNotMatch(rendered, /javascript:/i);
});
