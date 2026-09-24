import { Redis } from '@upstash/redis';
import { redisCreds } from './kv';

/**
 * House-wide stats — no TTL. Game keys expire in 24h; these must outlive a
 * night so leaderboards accumulate. Same Redis as the table; MemoryKV games
 * use an in-process map (tests + local without creds).
 */

export interface StatsKV {
  incrBy(key: string, field: string, n: number): Promise<void>;
  hset(key: string, fields: Record<string, string>): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  sadd(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  /** true when the key was absent and is now set. */
  setnx(key: string, value: string): Promise<boolean>;
}

class MemoryStatsKV implements StatsKV {
  private hashes = new Map<string, Record<string, string>>();
  private sets = new Map<string, Set<string>>();
  private strings = new Map<string, string>();

  async incrBy(key: string, field: string, n: number) {
    if (n === 0) return;
    const hash = this.hashes.get(key) ?? {};
    hash[field] = String((Number(hash[field] ?? 0) || 0) + n);
    this.hashes.set(key, hash);
  }

  async hset(key: string, fields: Record<string, string>) {
    const hash = this.hashes.get(key) ?? {};
    Object.assign(hash, fields);
    this.hashes.set(key, hash);
  }

  async hgetall(key: string) {
    return { ...(this.hashes.get(key) ?? {}) };
  }

  async sadd(key: string, member: string) {
    const set = this.sets.get(key) ?? new Set();
    set.add(member);
    this.sets.set(key, set);
  }

  async smembers(key: string) {
    return [...(this.sets.get(key) ?? [])];
  }

  async setnx(key: string, value: string) {
    if (this.strings.has(key)) return false;
    this.strings.set(key, value);
    return true;
  }
}

class RedisStatsKV implements StatsKV {
  constructor(private redis: Redis) {}

  async incrBy(key: string, field: string, n: number) {
    if (n === 0) return;
    await this.redis.hincrby(key, field, n);
  }

  async hset(key: string, fields: Record<string, string>) {
    if (Object.keys(fields).length === 0) return;
    await this.redis.hset(key, fields);
  }

  async hgetall(key: string) {
    const raw = await this.redis.hgetall<Record<string, string>>(key);
    if (!raw) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) out[k] = v == null ? '' : String(v);
    return out;
  }

  async sadd(key: string, member: string) {
    await this.redis.sadd(key, member);
  }

  async smembers(key: string) {
    const members = await this.redis.smembers(key);
    return (members ?? []).map(String);
  }

  async setnx(key: string, value: string) {
    const result = await this.redis.set(key, value, { nx: true });
    return result === 'OK';
  }
}

declare global {
  var __statsKV: StatsKV | undefined;
}

export function createMemoryStatsKV(): StatsKV {
  return new MemoryStatsKV();
}

export function setStatsKVForTests(kv: StatsKV | undefined): void {
  globalThis.__statsKV = kv;
}

export function getStatsKV(): StatsKV {
  if (!globalThis.__statsKV) {
    // STATS_SEED never attaches Redis — demo totals cannot hit live keys.
    if (process.env.STATS_SEED === '1') {
      if (redisCreds()) {
        console.warn('[stats] STATS_SEED=1: ignoring Redis creds — demo totals stay in memory');
      }
      globalThis.__statsKV = new MemoryStatsKV();
    } else {
      const creds = redisCreds();
      globalThis.__statsKV = creds
        ? new RedisStatsKV(new Redis({ ...creds, automaticDeserialization: false }))
        : new MemoryStatsKV();
    }
  }
  return globalThis.__statsKV;
}
