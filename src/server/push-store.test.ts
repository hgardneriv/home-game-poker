import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryPushKV,
  deleteDeviceToken,
  FOREGROUND_TTL_SECONDS,
  foregroundKey,
  getDeviceToken,
  getPushKV,
  isPlayerForeground,
  markPlayerForeground,
  saveDeviceToken,
  setPushKVForTests,
  tokenKey,
} from './push-store';

afterEach(() => {
  setPushKVForTests(undefined);
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('push-store keys', () => {
  it('scopes tokens and presence to game + player', () => {
    expect(tokenKey('g1', 'p1')).toBe('push:g1:p1');
    expect(foregroundKey('g1', 'p1')).toBe('fg:g1:p1');
  });
});

describe('memory token + presence', () => {
  it('round-trips a device token and deletes it', async () => {
    setPushKVForTests(createMemoryPushKV());
    await saveDeviceToken('g1', 'p1', 'a'.repeat(64));
    expect(await getDeviceToken('g1', 'p1')).toBe('a'.repeat(64));
    expect(await getDeviceToken('g1', 'other')).toBeNull();
    await deleteDeviceToken('g1', 'p1');
    expect(await getDeviceToken('g1', 'p1')).toBeNull();
  });

  it('treats a player as foreground until the TTL expires', async () => {
    setPushKVForTests(createMemoryPushKV());
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    expect(await isPlayerForeground('g1', 'p1')).toBe(false);
    await markPlayerForeground('g1', 'p1');
    expect(await isPlayerForeground('g1', 'p1')).toBe(true);
    vi.setSystemTime(1_000_000 + FOREGROUND_TTL_SECONDS * 1000 - 1);
    expect(await isPlayerForeground('g1', 'p1')).toBe(true);
    vi.setSystemTime(1_000_000 + FOREGROUND_TTL_SECONDS * 1000);
    expect(await isPlayerForeground('g1', 'p1')).toBe(false);
  });

  it('falls back to a memory map when Redis env is absent', () => {
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    setPushKVForTests(undefined);
    const kv = getPushKV();
    expect(kv).toBeDefined();
  });
});
