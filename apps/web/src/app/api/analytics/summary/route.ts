import { forwardApi } from '@/lib/api-proxy';

export const dynamic = 'force-dynamic';

export async function GET() {
  return forwardApi('/api/analytics/summary', { signal: AbortSignal.timeout(10_000) });
}
