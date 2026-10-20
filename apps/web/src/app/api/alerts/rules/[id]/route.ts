import { forwardApi } from "@/lib/api-proxy";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return forwardApi(`/api/alerts/rules/${encodeURIComponent(id)}`, { method: "PATCH", body: await request.text(), signal: AbortSignal.timeout(15_000) });
}
