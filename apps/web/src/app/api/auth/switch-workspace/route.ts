import { forwardApi, withSessionCookie } from "@/lib/api-proxy";

export async function POST(request: Request) {
  const response = await forwardApi("/api/auth/switch-workspace", {
    method: "POST",
    body: await request.text(),
    signal: AbortSignal.timeout(15_000),
  });
  return withSessionCookie(response);
}
