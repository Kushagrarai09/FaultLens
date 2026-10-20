import { forwardApi } from "@/lib/api-proxy";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return forwardApi(`/api/prompts/${encodeURIComponent(id)}/versions`, { method: "POST", body: await request.text() });
}
