import { forwardApi } from "@/lib/api-proxy";

export const dynamic = "force-dynamic";

export async function GET() { return forwardApi("/api/datasets"); }
export async function POST(request: Request) { return forwardApi("/api/datasets", { method: "POST", body: await request.text() }); }
