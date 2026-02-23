import { NextResponse } from "next/server";

import { getServiceStatusSnapshot } from "@/lib/service-status";

export const dynamic = "force-dynamic";

export const GET = async () => {
  const snapshot = await getServiceStatusSnapshot();

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
};
