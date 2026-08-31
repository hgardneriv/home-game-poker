import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientIp, rateLimited, setLimiterForTests } from './ratelimit';

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor() {}
  },
}));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static fixedWindow() {
      return { type: 'fixed' };
    }
    limit() {
      return Promise.resolve({ success: true });
    }
  },
}));

afterEach(() => {
  setLimiterForTests(undefined);
  vi.unstubAllEnvs();
});

describe('clientIp', () => {
  it('uses the first x-forwarded-for hop, then x-real-ip, then unknown', () => {
    expect(clientIp(new Request('http://x', { headers: { 'x-forwarded-for': ' 1.1.1.1, 2.2.2.2' } }))).toBe(
      '1.1.1.1'
    );
    expect(clientIp(new Request('http://x', { headers: { 'x-real-ip': '9.9.9.9' } }))).toBe('9.9.9.9');
    expect(clientIp(new Request('http://x'))).toBe('unknown');
  });
});

describe('rateLimited', () => {
  it('is a no-op without Redis or an injected limiter', async () => {
    setLimiterForTests(null);
    expect(await rateLimited('create', 'ip')).toBeNull();
  });

  it('returns 429 when the injected limiter denies', async () => {
    setLimiterForTests({ limit: async () => ({ success: false }) });
    const res = await rateLimited('create', 'ip');
    expect(res?.status).toBe(429);
    expect(await res!.json()).toMatchObject({ error: { code: 'rate-limited' } });
  });

  it('passes through when the injected limiter allows', async () => {
    setLimiterForTests({ limit: async () => ({ success: true }) });
    expect(await rateLimited('join', 'ip')).toBeNull();
  });

  it('is a no-op in next dev even if Redis is configured', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    setLimiterForTests(undefined);
    expect(await rateLimited('create', 'ip')).toBeNull();
  });

  it('builds Redis limiters outside next dev and reuses the cache', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('KV_REST_API_URL', 'https://example.upstash.io');
    vi.stubEnv('KV_REST_API_TOKEN', 'token');
    setLimiterForTests(undefined);
    expect(await rateLimited('create', 'ip')).toBeNull();
    expect(await rateLimited('join', 'ip')).toBeNull();
  });
});
