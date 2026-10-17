import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const baseUrl = (process.env.FAULTLENS_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
    const upstream = await fetch(`${baseUrl}/api/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(65_000),
    });
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Cannot reach FaultLens API. Start it on port 3001 and confirm Ollama is running." },
      { status: 502 },
    );
  }
}
