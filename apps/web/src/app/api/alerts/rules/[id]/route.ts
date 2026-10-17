import { NextResponse } from "next/server";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const baseUrl = (process.env.FAULTLENS_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
  try {
    const response = await fetch(`${baseUrl}/api/alerts/rules/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: await request.text(), cache: "no-store", signal: AbortSignal.timeout(15_000) });
    return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": response.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "Cannot reach FaultLens API." }, { status: 502 }); }
}
