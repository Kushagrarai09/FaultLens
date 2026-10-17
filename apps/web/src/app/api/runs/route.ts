import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const apiBaseUrl = () =>
  (process.env.FAULTLENS_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

async function forwardRequest(path: string, init?: RequestInit) {
  try {
    const upstream = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Cannot reach the FaultLens API. Start it on port 3001 or set FAULTLENS_API_URL." },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest) {
  return forwardRequest(`/api/runs${request.nextUrl.search}`);
}

export async function POST(request: NextRequest) {
  return forwardRequest("/api/runs", { method: "POST", body: await request.text() });
}
