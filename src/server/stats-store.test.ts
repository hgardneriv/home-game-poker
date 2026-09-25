import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createRedisStatsKV,
  normalizeHgetall,
  setStatsKVForTests,
  setnxSucceeded,
  type StatsRedis,
} from './stats-store';
import { persistStatsDeltas, readStatsSnapshot, type StatsDelta } from './stats';

describe('normalizeHgetall', () => {
  it('turns a flat Redis/Upstash HGETALL array into a field map', () => {
    expect(normalizeHgetall(['handsPlayed', '4', 'cardsDealt', '20', 'pair', '2'])).toEqual({
      handsPlayed: '4',
      cardsDealt: '20',
      pair: '2',
    });
  });

  it('keeps an already-parsed object', () => {
    expect(normalizeHgetall({ handsPlayed: 4, cardsDealt: 20 })).toEqual({
      handsPlayed: '4',
      cardsDealt: '20',
    });
  });

  it('empty / null is an empty map', () => {
    expect(normalizeHgetall(null)).toEqual({});
    expect(normalizeHgetall([])).toEqual({});
  });
});

describe('setnxSucceeded', () => {
  it('accepts OK / true / 1 from Upstash SET NX', () => {
    expect(setnxSucceeded('OK')).toBe(true);
    expect(setnxSucceeded(true)).toBe(true);
    expect(setnxSucceeded(1)).toBe(true);
    expect(setnxSucceeded('1')).toBe(true);
    expect(setnxSucceeded(null)).toBe(false);
    expect(setnxSucceeded(0)).toBe(false);
  });
});

/**
 * Fake Upstash REST client: HGETALL returns the raw flat array you get when
 * `automaticDeserialization: false` skips the SDK's map parser. Production
 * used that flag (copied from game KV) and /stats read every count as 0.
 */
function flatHgetallRedis(): StatsRedis {
  const hashes = new Map<string, Record<string, string>>();
  const sets = new Map<string, Set<string>>();
  const strings = new Map<string, string>();
  return {
    async hincrby(key, field, n) {
      const hash = hashes.get(key) ?? {};
      hash[field] = String((Number(hash[field] ?? 0) || 0) + n);
      hashes.set(key, hash);
    },
    async hset(key, fields) {
      const hash = hashes.get(key) ?? {};
      Object.assign(hash, fields);
      hashes.set(key, hash);
    },
    async hgetall(key) {
      const hash = hashes.get(key) ?? {};
      return Object.entries(hash).flat();
    },
    async sadd(key, member) {
      const set = sets.get(key) ?? new Set();
      set.add(member);
      sets.set(key, set);
    },
    async smembers(key) {
      return [...(sets.get(key) ?? [])];
    },
    async set(key, value, opts) {
      if (opts.nx && strings.has(key)) return null;
      strings.set(key, value);
      return 'OK';
    },
  };
}

describe('Redis stats through a flat HGETALL (the production bug)', () => {
  beforeEach(() => {
    setStatsKVForTests(undefined);
  });
  afterEach(() => {
    setStatsKVForTests(undefined);
  });

  it('persisted house / name / calls survive a flat-array HGETALL read', async () => {
    const kv = createRedisStatsKV(flatHgetallRedis());
    const delta: StatsDelta = {
      gameId: 'live',
      calls: [{ playerId: 'u_x', name: 'Harry', isBot: false, seq: 1, at: 1 }],
      hand: {
        fingerprint: 'h:live:1:board:Harry',
        cardsDealt: 9,
        cardsPlayed: 7,
        actors: [
          { id: 'u_x', name: 'Harry', isBot: false, won: true, folded: false, net: 6, made: 'pair' },
          { id: 'bot', name: 'Lucky Lou', isBot: true, won: false, folded: true, net: 0, made: 'highCard' },
        ],
      },
    };
    await persistStatsDeltas([delta], kv);
    const snap = await readStatsSnapshot(kv);
    expect(snap.house.handsPlayed).toBe(1);
    expect(snap.house.cardsDealt).toBe(9);
    expect(snap.house.hands.pair).toBe(1);
    expect(snap.players).toEqual([
      expect.objectContaining({ id: 'Harry', name: 'Harry', handsDealt: 1, calls: 1, money: 6 }),
    ]);
    expect(snap.bots[0]).toMatchObject({ name: 'Lucky Lou', calls: 0, handsFolded: 1 });
  });
});
