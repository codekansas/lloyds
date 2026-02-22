import { test as base } from "@playwright/test";

import { resetDatabase } from "./helpers/db";

const test = base.extend({});

test.beforeEach(async () => {
  await resetDatabase();
});

export { test };
export { expect } from "@playwright/test";
