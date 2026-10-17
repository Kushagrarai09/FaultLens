import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const baseUrl = () => (process.env.FAULTLENS_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export async function GET() {
  try {
    const response = await fetch(`${baseUrl()}/api/alerts/rules`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": response.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "Cannot reach FaultLens API. Start the API and verify PostgreSQL configuration." }, { status: 502 }); }
}

export async function POST(request: Request) {
  try {
    const response = await fetch(`${baseUrl()}/api/alerts/rules`, { method: "POST", headers: { "Content-Type": "application/json" }, body: await request.text(), cache: "no-store", signal: AbortSignal.timeout(15_000) });
    return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": response.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "Cannot reach FaultLens API." }, { status: 502 }); }
}
