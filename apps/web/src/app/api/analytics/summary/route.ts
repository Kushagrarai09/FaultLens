import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const baseUrl = (process.env.FAULTLENS_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

  try {
    const upstream = await fetch(`${baseUrl}/api/analytics/summary`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { message: 'Cannot reach the FaultLens API. Start it on port 3001 and confirm PostgreSQL is configured.' },
      { status: 502 },
    );
  }
}
