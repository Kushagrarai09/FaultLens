import { forwardApi } from "@/lib/api-proxy";

export async function GET() {
  return forwardApi("/api/workspaces", { signal: AbortSignal.timeout(15_000) });
}
