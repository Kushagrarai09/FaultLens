import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "faultlens_session";
const baseUrl = () => (process.env.FAULTLENS_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function forwardApi(path: string, init: RequestInit = {}) {
  try {
    const token = await sessionToken();
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const upstream = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(65_000),
    });
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Cannot reach the FaultLens API. Check that the API and its dependencies are running." },
      { status: 502 },
    );
  }
}

export async function withSessionCookie(response: NextResponse) {
  if (response.status < 200 || response.status >= 300) return response;
  const payload = await response.clone().json() as { accessToken?: string } & Record<string, unknown>;
  if (!payload.accessToken) return response;
  const token = payload.accessToken;
  delete payload.accessToken;
  const safePayload = payload;
  const safeResponse = NextResponse.json(safePayload, { status: response.status });
  safeResponse.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60,
  });
  return safeResponse;
}

export { SESSION_COOKIE };
