import type { Page } from "@playwright/test";

type NavigationOptions = {
  maxWaitMs?: number;
  retryDelayMs?: number;
  gotoTimeoutMs?: number;
};

const waitFor = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

export const gotoWithoutServerError = async (
  page: Page,
  path: string,
  options: NavigationOptions = {},
): Promise<number | null> => {
  const maxWaitMs = options.maxWaitMs ?? 120_000;
  const retryDelayMs = options.retryDelayMs ?? 4_000;
  const gotoTimeoutMs = options.gotoTimeoutMs ?? 20_000;
  const startedAt = Date.now();

  let attempts = 0;
  let lastStatus: number | null = null;
  let lastError: unknown = null;

  while (Date.now() - startedAt < maxWaitMs) {
    attempts += 1;
    lastError = null;

    try {
      const response = await page.goto(path, {
        waitUntil: "domcontentloaded",
        timeout: gotoTimeoutMs,
      });

      lastStatus = response?.status() ?? null;

      if (lastStatus === null || lastStatus < 500) {
        return lastStatus;
      }
    } catch (error: unknown) {
      lastError = error;
    }

    await waitFor(retryDelayMs);
  }

  const statusSuffix = lastStatus === null ? "null" : `${lastStatus}`;
  const errorSuffix = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(
    `Failed to load "${path}" without a 5xx response within ${maxWaitMs}ms after ${attempts} attempts (last status: ${statusSuffix}).${errorSuffix}`,
  );
};
