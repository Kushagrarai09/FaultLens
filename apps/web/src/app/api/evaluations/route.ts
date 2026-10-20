import { forwardApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  return forwardApi("/api/evaluations", { method: "POST", body: await request.text(), signal: AbortSignal.timeout(300_000) });
}
