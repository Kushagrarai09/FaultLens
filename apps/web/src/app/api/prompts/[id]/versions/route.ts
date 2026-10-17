import { NextResponse } from "next/server";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const baseUrl = (process.env.FAULTLENS_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
  try {
    const upstream = await fetch(`${baseUrl}/api/prompts/${encodeURIComponent(id)}/versions`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: await request.text(),
      cache: "no-store", signal: AbortSignal.timeout(65_000),
    });
    return new NextResponse(await upstream.text(), { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "Cannot reach FaultLens API." }, { status: 502 });
  }
}
