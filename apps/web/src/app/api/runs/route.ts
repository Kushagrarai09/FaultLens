import { NextRequest } from "next/server";
import { forwardApi } from "@/lib/api-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return forwardApi(`/api/runs${request.nextUrl.search}`);
}

export async function POST(request: NextRequest) {
  return forwardApi("/api/runs", { method: "POST", body: await request.text() });
}
