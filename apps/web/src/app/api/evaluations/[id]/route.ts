import { NextResponse } from "next/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const baseUrl = (process.env.FAULTLENS_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
  try {
    const upstream = await fetch(`${baseUrl}/api/evaluations/${encodeURIComponent(id)}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    return new NextResponse(await upstream.text(), { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "Cannot reach FaultLens API." }, { status: 502 }); }
}
