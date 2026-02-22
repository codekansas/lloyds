import type { NextRequest } from "next/server";

import { env } from "@/lib/env";

export const isCronAuthorized = (request: NextRequest): boolean => {
  const secret = env.cronSecret;

  if (!secret) {
    return false;
  }

  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${secret}`) {
    return true;
  }

  const headerSecret = request.headers.get("x-cron-secret");
  if (headerSecret === secret) {
    return true;
  }

  const querySecret = request.nextUrl.searchParams.get("cronKey");
  return querySecret === secret;
};
