import { forwardApi } from "@/lib/api-proxy";

export async function GET() {
  return forwardApi("/api/auth/me", { signal: AbortSignal.timeout(15_000) });
}
