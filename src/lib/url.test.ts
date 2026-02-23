import assert from "node:assert/strict";
import test from "node:test";

import { normalizeUrl } from "./url";

test("normalizes web URL variants to canonical https without www", () => {
  const normalized = normalizeUrl("http://www.Example.com/research/?utm_source=newsletter&b=2&a=1#summary");

  assert.equal(normalized, "https://example.com/research?a=1&b=2");
});

test("keeps protocol and port for non-default web ports", () => {
  const normalized = normalizeUrl("http://www.example.com:8080/path/?utm_medium=email&x=1");

  assert.equal(normalized, "http://example.com:8080/path?x=1");
});

test("sorts duplicate query params by key and value", () => {
  const normalized = normalizeUrl("https://example.com/path?b=2&a=2&a=1");

  assert.equal(normalized, "https://example.com/path?a=1&a=2&b=2");
});
