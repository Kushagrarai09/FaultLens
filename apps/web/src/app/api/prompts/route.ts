import { forwardApi } from "@/lib/api-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return forwardApi("/api/prompts");
}

export async function POST(request: Request) {
  return forwardApi("/api/prompts", { method: "POST", body: await request.text() });
}
