import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { json } from './api';
import { redisCreds } from './kv';

/**
 * Fixed-window limits on expensive human actions — not the SSE 500ms poll.
 * No Redis (e2e MemoryKV) → no-op. `next dev` also no-ops: `.env.local`
 * Redis would otherwise share the production 5-creates/hour bucket with
 * the iPhone sim.
 */

export type LimitKind = 'create' | 'join' | 'mutate' | 'stream';

export interface Limiter {
  limit(identifier: string): Promise<{ success: boolean }>;
}

const WINDOWS: Record<LimitKind, { tokens: number; window: `${number} ${'s' | 'm' | 'h'}` }> = {
  create: { tokens: 5, window: '1 h' },
  join: { tokens: 20, window: '1 m' },
  mutate: { tokens: 30, window: '1 m' },
  stream: { tokens: 30, window: '1 m' },
};

/** Test seam — `null` means allow-all; `undefined` means use Redis if configured. */
let override: Limiter | null | undefined;

export function setLimiterForTests(limiter: Limiter | null | undefined): void {
  override = limiter;
}

let cached: Record<LimitKind, Limiter> | null | undefined;

function built(): Record<LimitKind, Limiter> | null {
  if (override !== undefined) {
    return override
      ? { create: override, join: override, mutate: override, stream: override }
      : null;
  }
  if (process.env.NODE_ENV === 'development') return null;
  if (cached !== undefined) return cached;
  const creds = redisCreds();
  if (!creds) {
    cached = null;
    return null;
  }
  const redis = new Redis({ ...creds, automaticDeserialization: false });
  cached = (Object.keys(WINDOWS) as LimitKind[]).reduce(
    (acc, kind) => {
      const { tokens, window } = WINDOWS[kind];
      acc[kind] = new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(tokens, window),
        prefix: `rl:${kind}`,
        ephemeralCache: new Map(),
      });
      return acc;
    },
    {} as Record<LimitKind, Limiter>
  );
  return cached;
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export async function rateLimited(
  kind: LimitKind,
  identifier: string
): Promise<Response | null> {
  const limiters = built();
  if (!limiters) return null;
  const { success } = await limiters[kind].limit(identifier);
  if (success) return null;
  return json(
    { error: { code: 'rate-limited', message: 'Too many requests — try again shortly' } },
    429
  );
}
