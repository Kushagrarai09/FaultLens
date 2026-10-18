import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxy("/api/prompts", { method: "GET" });
}

export async function POST(request: Request) {
  return proxy("/api/prompts", { method: "POST", body: await request.text() });
}

async function proxy(path: string, init: RequestInit) {
  const baseUrl = (process.env.FAULTLENS_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(65_000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ message: "Cannot reach FaultLens API. Start the API and verify PostgreSQL configuration." }, { status: 502 });
  }
}
