import { forwardApi } from "@/lib/api-proxy";

export async function POST() {
  return forwardApi("/api/alerts/evaluate", { method: "POST", signal: AbortSignal.timeout(30_000) });
}
