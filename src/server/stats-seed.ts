import { persistStatsDeltas, type HandActor, type StatsDelta } from './stats';
import { getStatsKV, setStatsKVForTests } from './stats-store';
import type { HandKind } from '@/engine/hand-category';

/**
 * In-memory demo totals for local `/stats`. Never writes Redis.
 * `STATS_SEED=1` forces MemoryStatsKV in getStatsKV even if `.env.local` has creds.
 */

let seeded = false;

export function statsSeedRequested(): boolean {
  return process.env.STATS_SEED === '1';
}

function actor(
  name: string,
  opts: { isBot?: boolean; won?: boolean; folded?: boolean; net?: number; made?: HandKind }
): HandActor {
  return {
    id: name,
    name,
    isBot: opts.isBot ?? false,
    won: opts.won ?? false,
    folded: opts.folded ?? false,
    net: opts.net ?? 0,
    made: opts.made,
  };
}

function hand(
  fp: string,
  actors: HandActor[],
  calls: { name: string; isBot?: boolean; seq: number }[] = []
): StatsDelta {
  const cardsDealt = 2 * actors.length + 5;
  const live = actors.filter((a) => !a.folded).length;
  return {
    gameId: 'seed',
    calls: calls.map((c) => ({
      playerId: c.name,
      name: c.name,
      isBot: c.isBot ?? false,
      seq: c.seq,
      at: c.seq,
    })),
    hand: {
      fingerprint: fp,
      cardsDealt,
      cardsPlayed: 2 * live + 5,
      actors,
    },
  };
}

function win(name: string, isBot: boolean, night: number): StatsDelta {
  return {
    gameId: `seed-night-${night}`,
    calls: [],
    gameEnd: {
      fingerprint: `g:seed:${night}:${name}`,
      winnerId: name,
      players: [
        { id: name, name, isBot, hasPlayed: true },
        { id: 'Ada', name: 'Ada', isBot: false, hasPlayed: true },
      ],
    },
  };
}

/** Fake nights — names are the player keys; includes calls. */
export function demoStatsDeltas(): StatsDelta[] {
  const deltas: StatsDelta[] = [];
  let seq = 1;
  const kinds: HandKind[] = [
    'highCard',
    'pair',
    'pair',
    'pair',
    'twoPair',
    'twoPair',
    'trips',
    'straight',
    'flush',
    'fullHouse',
    'quads',
    'straightFlush',
    'royalFlush',
  ];
  kinds.forEach((made, i) => {
    deltas.push(
      hand(
        `h:seed:${i}`,
        [
          actor('Harry', { won: i % 3 === 0, net: i % 3 === 0 ? 8 : -4, made }),
          actor('Lucky Lou', { isBot: true, won: i % 3 === 1, net: 0, made }),
          actor('Ada', { won: i % 3 === 2, folded: i === 0, net: i % 3 === 2 ? 6 : -2, made }),
        ],
        [
          { name: 'Harry', seq: seq++ },
          { name: 'Lucky Lou', isBot: true, seq: seq++ },
        ]
      )
    );
  });
  deltas.push(hand('h:seed:pat', [actor('Pat', { won: false, folded: true, net: -2, made: 'highCard' })]));
  for (let n = 0; n < 8; n++) deltas.push(win('Lucky Lou', true, n));
  for (let n = 8; n < 13; n++) deltas.push(win('Raisin Rita', true, n));
  for (let n = 13; n < 16; n++) deltas.push(win('Harry', false, n));
  return deltas;
}

export async function maybeSeedDemoStats(): Promise<boolean> {
  if (!statsSeedRequested() || seeded) return false;
  seeded = true;
  const kv = getStatsKV();
  await persistStatsDeltas(demoStatsDeltas(), kv);
  return true;
}

/** Tests only — drop the once-flag so a fresh Memory map can be reseeded. */
export function resetStatsSeedForTests(): void {
  seeded = false;
  setStatsKVForTests(undefined);
}
