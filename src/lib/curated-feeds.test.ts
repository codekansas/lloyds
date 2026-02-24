import assert from "node:assert/strict";
import test from "node:test";

import { parseCuratedFeedSeeds } from "./curated-feeds";

test("parses sorted line-based feed URLs and ignores comments", () => {
  const feeds = parseCuratedFeedSeeds(`
# Curated feed sources
https://www.beta.example.com/rss?utm_source=abc
https://alpha.example.com/feed.xml

https://alpha.example.com/feed.xml
`);

  assert.deepEqual(feeds, [
    { url: "https://alpha.example.com/feed.xml" },
    { url: "https://beta.example.com/rss" },
  ]);
});

test("rejects legacy JSON array feed lists", () => {
  assert.throws(
    () =>
      parseCuratedFeedSeeds(`
[
  {"url":"https://example.com/object-feed.xml"},
  "https://www.example.com/string-feed.xml?utm_campaign=test"
]
`),
    /line-delimited URL list/,
  );
});

test("throws when gist content has no parseable feed URLs", () => {
  assert.throws(
    () => parseCuratedFeedSeeds("not-a-feed-url"),
    /line-delimited URL list/,
  );
});
