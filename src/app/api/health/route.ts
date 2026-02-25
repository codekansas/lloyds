import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { logEvent } from "@/lib/observability";
import { getServiceStatusSnapshot, type ServiceStatus } from "@/lib/service-status";

const nonBlockingServiceIds: ServiceStatus["id"][] = ["openai-config"];

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

export const dynamic = "force-dynamic";

export const GET = async (request: NextRequest) => {
  const mode = request.nextUrl.searchParams.get("mode");
  if (mode !== "readiness") {
    return NextResponse.json(
      {
        status: "ok",
        mode: "liveness",
        appEnv: env.appEnv,
        timestamp: new Date().toISOString(),
      },
      {
        headers: noStoreHeaders,
      },
    );
  }

  const snapshot = await getServiceStatusSnapshot();
  const blockingServices = snapshot.services.filter(
    (service) => service.state === "outage" && !nonBlockingServiceIds.includes(service.id),
  );
  const isReady = blockingServices.length === 0;

  if (!isReady) {
    logEvent("warn", "health.readiness.unhealthy", {
      overallState: snapshot.overallState,
      blockingServices: blockingServices.map((service) => ({ id: service.id, state: service.state, summary: service.summary })),
    });
  }

  return NextResponse.json(
    {
      status: isReady ? "ok" : "error",
      mode: "readiness",
      appEnv: env.appEnv,
      generatedAt: snapshot.generatedAt,
      overallState: snapshot.overallState,
      blockingServices: blockingServices.map((service) => ({
        id: service.id,
        state: service.state,
        summary: service.summary,
      })),
    },
    {
      status: isReady ? 200 : 503,
      headers: noStoreHeaders,
    },
  );
};
