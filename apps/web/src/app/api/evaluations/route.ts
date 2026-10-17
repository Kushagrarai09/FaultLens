import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const baseUrl = (process.env.FAULTLENS_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
  try {
    const upstream = await fetch(`${baseUrl}/api/evaluations`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: await request.text(),
      cache: "no-store", signal: AbortSignal.timeout(300_000),
    });
    return new NextResponse(await upstream.text(), { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "Evaluation request timed out or the API is unavailable. Check Ollama and retry with a smaller dataset." }, { status: 502 }); }
}
