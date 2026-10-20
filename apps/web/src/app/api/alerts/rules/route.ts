import { forwardApi } from "@/lib/api-proxy";

export const dynamic = "force-dynamic";
export async function GET() {
  return forwardApi("/api/alerts/rules", { signal: AbortSignal.timeout(15_000) });
}

export async function POST(request: Request) {
  return forwardApi("/api/alerts/rules", { method: "POST", body: await request.text(), signal: AbortSignal.timeout(15_000) });
}
