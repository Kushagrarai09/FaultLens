import { forwardApi } from "@/lib/api-proxy";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return forwardApi(`/api/evaluations/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(15_000) });
}
