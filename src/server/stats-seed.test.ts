import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoStatsDeltas, maybeSeedDemoStats, resetStatsSeedForTests } from './stats-seed';
import { createMemoryStatsKV, setStatsKVForTests } from './stats-store';
import { persistStatsDeltas, readBotStats, readStatsSnapshot } from './stats';

describe('STATS_SEED demo', () => {
  beforeEach(() => {
    resetStatsSeedForTests();
    setStatsKVForTests(createMemoryStatsKV());
    vi.stubEnv('STATS_SEED', '1');
  });
  afterEach(() => {
    resetStatsSeedForTests();
    setStatsKVForTests(undefined);
    vi.unstubAllEnvs();
  });

  it('keys humans by display name and includes calls for Harry and Lucky Lou', async () => {
    expect(demoStatsDeltas().some((d) => d.calls.some((c) => c.name === 'Harry'))).toBe(true);
    await maybeSeedDemoStats();
    const snap = await readStatsSnapshot();
    expect(snap.house.handsPlayed).toBeGreaterThan(0);
    expect(snap.players.map((p) => p.id)).toEqual(expect.arrayContaining(['Harry', 'Ada', 'Pat']));
    expect(snap.players.find((p) => p.id === 'Harry')?.calls).toBeGreaterThan(0);
    expect(snap.bots[0].name).toBe('Lucky Lou');
    const lou = await readBotStats('lucky-lou');
    expect(lou?.calls).toBeGreaterThan(0);
    expect(lou?.gameWins).toBe(8);
  });

  it('does not seed when STATS_SEED is unset', async () => {
    vi.stubEnv('STATS_SEED', '');
    resetStatsSeedForTests();
    setStatsKVForTests(createMemoryStatsKV());
    expect(await maybeSeedDemoStats()).toBe(false);
    const snap = await readStatsSnapshot();
    expect(snap.house.handsPlayed).toBe(0);
  });

  it('writes only through persistStatsDeltas (name keys, no u_ ids)', async () => {
    const kv = createMemoryStatsKV();
    await persistStatsDeltas(demoStatsDeltas(), kv);
    const snap = await readStatsSnapshot(kv);
    expect(snap.players.every((p) => p.id === p.name && !p.id.startsWith('u_'))).toBe(true);
  });
});
