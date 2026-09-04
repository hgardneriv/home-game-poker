import { Redis } from '@upstash/redis';
import { redisCreds } from './kv';

/**
 * Device tokens and short-lived "looking at the table" presence.
 * Kept out of GameState so the engine stays pure and redaction cannot leak
 * a push token. Same Redis as the table; MemoryKV games use an in-process map.
 */

export const TOKEN_TTL_SECONDS = 24 * 60 * 60;
/** Slightly longer than a couple of missed SSE ticks; iOS kills the stream in background. */
export const FOREGROUND_TTL_SECONDS = 8;

export interface PushKV {
  set(key: string, value: string, ttlSec: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
}

export function tokenKey(gameId: string, playerId: string): string {
  return `push:${gameId}:${playerId}`;
}

export function foregroundKey(gameId: string, playerId: string): string {
  return `fg:${gameId}:${playerId}`;
}

export function lastPushKey(gameId: string, playerId: string): string {
  return `pushlast:${gameId}:${playerId}`;
}

/** Last APNs attempt — no token, no key material. For device debug. */
export interface PushAttempt {
  at: number;
  outcome: 'sent' | 'skipped' | 'error';
  skip?: 'bot' | 'left' | 'unconfigured' | 'foreground' | 'no-token' | 'not-acting';
  status?: number;
  reason?: string;
}

class MemoryPushKV implements PushKV {
  private store = new Map<string, { value: string; exp: number }>();

  async set(key: string, value: string, ttlSec: number) {
    this.store.set(key, { value, exp: Date.now() + ttlSec * 1000 });
  }

  async get(key: string) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.exp) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(key: string) {
    this.store.delete(key);
  }
}

class RedisPushKV implements PushKV {
  constructor(private redis: Redis) {}

  async set(key: string, value: string, ttlSec: number) {
    await this.redis.set(key, value, { ex: ttlSec });
  }

  async get(key: string) {
    const v = await this.redis.get<string>(key);
    return v ?? null;
  }

  async del(key: string) {
    await this.redis.del(key);
  }
}

declare global {
  var __pushKV: PushKV | undefined;
}

/** Test seam — pass a fresh Memory map (or undefined to rebuild from env). */
export function setPushKVForTests(kv: PushKV | undefined): void {
  globalThis.__pushKV = kv;
}

export function getPushKV(): PushKV {
  if (!globalThis.__pushKV) {
    const creds = redisCreds();
    globalThis.__pushKV = creds
      ? new RedisPushKV(new Redis({ ...creds, automaticDeserialization: false }))
      : new MemoryPushKV();
  }
  return globalThis.__pushKV;
}

export function createMemoryPushKV(): PushKV {
  return new MemoryPushKV();
}

export async function saveDeviceToken(
  gameId: string,
  playerId: string,
  token: string
): Promise<void> {
  await getPushKV().set(tokenKey(gameId, playerId), token, TOKEN_TTL_SECONDS);
}

export async function getDeviceToken(gameId: string, playerId: string): Promise<string | null> {
  return getPushKV().get(tokenKey(gameId, playerId));
}

export async function deleteDeviceToken(gameId: string, playerId: string): Promise<void> {
  await getPushKV().del(tokenKey(gameId, playerId));
}

export async function markPlayerForeground(gameId: string, playerId: string): Promise<void> {
  await getPushKV().set(foregroundKey(gameId, playerId), '1', FOREGROUND_TTL_SECONDS);
}

export async function isPlayerForeground(gameId: string, playerId: string): Promise<boolean> {
  return (await getPushKV().get(foregroundKey(gameId, playerId))) !== null;
}

/** Native app went to the background — SSE may still be open for a few seconds. */
export async function clearPlayerForeground(gameId: string, playerId: string): Promise<void> {
  await getPushKV().del(foregroundKey(gameId, playerId));
}

export async function saveLastPush(gameId: string, playerId: string, attempt: PushAttempt): Promise<void> {
  await getPushKV().set(lastPushKey(gameId, playerId), JSON.stringify(attempt), TOKEN_TTL_SECONDS);
}

export async function getLastPush(gameId: string, playerId: string): Promise<PushAttempt | null> {
  const raw = await getPushKV().get(lastPushKey(gameId, playerId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PushAttempt;
  } catch {
    return null;
  }
}
