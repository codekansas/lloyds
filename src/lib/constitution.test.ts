import assert from "node:assert/strict";
import test from "node:test";

import { defaultConstitutionText } from "./constitution";

test("default constitution emphasizes cross-domain accessibility", () => {
  assert.match(defaultConstitutionText, /cross-domain accessibility/i);
  assert.match(defaultConstitutionText, /adjacent domains/i);
  assert.match(defaultConstitutionText, /outsider comprehensibility/i);
});

test("local enforcement addendum is present exactly once", () => {
  const matches = defaultConstitutionText.match(/## Local Enforcement Addendum/g) ?? [];
  assert.equal(matches.length, 1);
});
