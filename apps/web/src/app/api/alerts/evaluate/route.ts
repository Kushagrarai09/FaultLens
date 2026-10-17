import { NextResponse } from "next/server";

export async function POST() {
  const baseUrl = (process.env.FAULTLENS_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
  try {
    const response = await fetch(`${baseUrl}/api/alerts/evaluate`, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(30_000) });
    return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": response.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "Cannot reach FaultLens API." }, { status: 502 }); }
}
