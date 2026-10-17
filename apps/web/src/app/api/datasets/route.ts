import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() { return proxy("GET"); }
export async function POST(request: Request) { return proxy("POST", await request.text()); }

async function proxy(method: string, body?: string) {
  const baseUrl = (process.env.FAULTLENS_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
  try {
    const response = await fetch(`${baseUrl}/api/datasets`, { method, headers: { "Content-Type": "application/json" }, body, cache: "no-store", signal: AbortSignal.timeout(65_000) });
    return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": response.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "Cannot reach FaultLens API." }, { status: 502 }); }
}
