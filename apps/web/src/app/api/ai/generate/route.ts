import { forwardApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  return forwardApi("/api/ai/generate", { method: "POST", body: await request.text(), signal: AbortSignal.timeout(65_000) });
}
