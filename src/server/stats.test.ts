import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Table } from '@/engine/test-utils';
import {
  LEADERBOARD_CAP,
  botSlug,
  extractStatsDelta,
  persistStatsDeltas,
  playerStatsKey,
  readBotStats,
  readStatsSnapshot,
  type StatsDelta,
} from './stats';
import { createMemoryStatsKV, setStatsKVForTests } from './stats-store';
import { MemoryKV } from './kv';
import { createNewGame, withGame } from './store';

describe('identity keys', () => {
  it('keys humans by trimmed display name — no extra ids', () => {
    expect(playerStatsKey('  Harry  ')).toBe('Harry');
    expect(playerStatsKey('Harry')).not.toBe(playerStatsKey('HARRY'));
    expect(playerStatsKey('Ada')).toBe('Ada');
    expect(botSlug('Lucky Lou')).toBe('lucky-lou');
    expect(botSlug('Chip Chaplin')).toBe('chip-chaplin');
  });
});

describe('extractStatsDelta', () => {
  it('counts a call, a fold-win, and skips made-hand evals without a river', () => {
    const t = new Table(2);
    t.start();
    const beforeCall = t.state;
    t.act('p0', 'call');
    const callDelta = extractStatsDelta(beforeCall, t.state);
    expect(callDelta?.calls).toEqual([
      expect.objectContaining({ playerId: 'p0', name: 'P0', isBot: false }),
    ]);
    expect(callDelta?.hand).toBeUndefined();

    const preFold = t.state;
    t.act('p1', 'fold');
    const foldDelta = extractStatsDelta(preFold, t.state);
    expect(foldDelta?.hand).toMatchObject({
      cardsDealt: 4,
      cardsPlayed: 2,
    });
    expect(foldDelta?.hand?.actors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'p0', won: true, folded: false, made: undefined }),
        expect.objectContaining({ id: 'p1', won: false, folded: true, made: undefined }),
      ])
    );
    expect(foldDelta?.gameEnd).toBeUndefined();
  });

  it('evaluates every in-hand player on a river showdown, including folders', () => {
    const t = new Table(3);
    t.start();
    t.act('p0', 'fold');
    t.act('p1', 'call');
    t.act('p2', 'check');
    const preShowdown = t.state;
    expect(preShowdown.hand?.result).toBeNull();
    t.checkDown();
    const delta = extractStatsDelta(preShowdown, t.state);
    expect(t.state.hand?.board).toHaveLength(5);
    expect(delta?.hand?.actors).toHaveLength(3);
    expect(delta?.hand?.actors.every((a) => a.made)).toBe(true);
    expect(delta?.hand?.actors.find((a) => a.id === 'p0')?.folded).toBe(true);
  });

  it('records game-end for players who were dealt, not kicked-only seats', () => {
    const t = new Table(3);
    t.apply({ type: 'kick', byId: 'p0', playerId: 'p2' });
    t.start();
    t.foldAround();
    const playing = t.state;
    expect(playing.phase).toBe('hand-over');
    t.apply({ type: 'endGame', byId: 'p0' });
    const delta = extractStatsDelta(playing, t.state);
    expect(delta?.gameEnd?.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'p0', hasPlayed: true }),
        expect.objectContaining({ id: 'p1', hasPlayed: true }),
        expect.objectContaining({ id: 'p2', hasPlayed: false, name: 'P2' }),
      ])
    );
  });

  it('does not emit a delta for a no-op lobby action', () => {
    const t = new Table(2);
    const prev = t.state;
    t.apply({ type: 'addBot', byId: 'p0' });
    const delta = extractStatsDelta(prev, t.state);
    expect(delta).toBeNull();
  });
});

describe('persist + snapshot', () => {
  beforeEach(() => {
    setStatsKVForTests(createMemoryStatsKV());
  });
  afterEach(() => {
    setStatsKVForTests(undefined);
  });

  it('accumulates house, player calls/money, and hides never-dealt seats', async () => {
    const t = new Table(3);
    t.apply({ type: 'kick', byId: 'p0', playerId: 'p2' });
    t.start();
    const pre = t.state;
    t.act('p0', 'call');
    const callDelta = extractStatsDelta(pre, t.state)!;
    const preFold = t.state;
    t.act('p1', 'fold');
    const handDelta = extractStatsDelta(preFold, t.state)!;
    const preEnd = t.state;
    t.apply({ type: 'endGame', byId: 'p0' });
    const endDelta = extractStatsDelta(preEnd, t.state)!;

    await persistStatsDeltas([callDelta, handDelta, endDelta]);
    await persistStatsDeltas([callDelta, handDelta, endDelta]); // idempotent

    const snap = await readStatsSnapshot();
    expect(snap.house.handsPlayed).toBe(1);
    expect(snap.house.cardsDealt).toBe(4);
    expect(snap.players).toHaveLength(2);
    expect(snap.players.map((p) => p.name).sort()).toEqual(['P0', 'P1']);
    const p0 = snap.players.find((p) => p.id === 'P0')!;
    expect(p0.calls).toBe(1);
    expect(p0.handsDealt).toBe(1);
    expect(p0.handsWon).toBe(1);
    expect(p0.gamesPlayed).toBe(1);
    expect(p0.money).toBeGreaterThan(0);
    expect(snap.players.find((p) => p.name === 'P2')).toBeUndefined();
    expect(snap.toleranceNote).toMatch(/1\.5pp/);
  });

  it('ranks bots by game wins and keeps per-bot calls + made hands', async () => {
    const t = new Table(1);
    t.apply({ type: 'addBot', byId: 'p0' });
    const bot = Object.values(t.state.players).find((p) => p.isBot)!;
    t.start();
    const before = t.state;
    t.act(t.toAct!, 'fold');
    const handDelta = extractStatsDelta(before, t.state);
    expect(handDelta?.hand).toBeTruthy();

    const call: StatsDelta = {
      gameId: t.state.id,
      calls: [{ playerId: bot.id, name: bot.name, isBot: true, seq: 99, at: 1 }],
    };
    const end: StatsDelta = {
      gameId: t.state.id,
      calls: [],
      gameEnd: {
        fingerprint: 'g:test-bot-win',
        winnerId: bot.id,
        players: [
          { id: 'p0', name: 'P0', isBot: false, hasPlayed: true },
          { id: bot.id, name: bot.name, isBot: true, hasPlayed: true },
        ],
      },
    };
    await persistStatsDeltas([handDelta!, call, end]);

    const snap = await readStatsSnapshot();
    expect(snap.bots[0].name).toBe(bot.name);
    expect(snap.bots[0].gameWins).toBe(1);
    expect(snap.bots[0].calls).toBe(1);
    const detail = await readBotStats(botSlug(bot.name));
    expect(detail?.calls).toBe(1);
    expect(detail?.gameWins).toBe(1);
    expect(detail?.handsDealt).toBe(1);
  });

  it('accumulates when the display name exists, else creates a row', async () => {
    const hand = (name: string, fp: string, net: number, calls = 0): StatsDelta => ({
      gameId: 'night',
      calls: calls
        ? [{ playerId: 'ignored', name, isBot: false, seq: calls, at: 1 }]
        : [],
      hand: {
        fingerprint: fp,
        cardsDealt: 4,
        cardsPlayed: 4,
        actors: [{ id: 'ignored', name, isBot: false, won: net > 0, folded: false, net }],
      },
    });
    await persistStatsDeltas([hand('Harry', 'h:1', 4, 1)]);
    await persistStatsDeltas([hand('Harry', 'h:2', -2, 1)]);
    await persistStatsDeltas([hand('Pat', 'h:3', 6)]);

    const snap = await readStatsSnapshot();
    expect(snap.players).toHaveLength(2);
    const harry = snap.players.find((p) => p.id === 'Harry')!;
    const pat = snap.players.find((p) => p.id === 'Pat')!;
    expect(harry.handsDealt).toBe(2);
    expect(harry.calls).toBe(2);
    expect(harry.money).toBe(2);
    expect(pat.handsDealt).toBe(1);
    expect(pat.money).toBe(6);
    expect(snap.players.every((p) => !p.id.startsWith('u_'))).toBe(true);
  });

  it(`caps the player leaderboard at ${LEADERBOARD_CAP}`, async () => {
    const deltas: StatsDelta[] = [];
    for (let i = 0; i < LEADERBOARD_CAP + 3; i++) {
      const name = `P${i}`;
      deltas.push({
        gameId: 'g',
        calls: [],
        hand: {
          fingerprint: `h:g:${i}`,
          cardsDealt: 4,
          cardsPlayed: 4,
          actors: [
            {
              id: `u${i}`,
              name,
              isBot: false,
              won: i === 0,
              folded: false,
              net: 100 - i,
            },
          ],
        },
      });
    }
    await persistStatsDeltas(deltas);
    const snap = await readStatsSnapshot();
    expect(snap.players).toHaveLength(LEADERBOARD_CAP);
    expect(snap.players[0].money).toBe(100);
    expect(snap.players.at(-1)!.money).toBe(100 - (LEADERBOARD_CAP - 1));
  });
});

describe('withGame records stats after CAS', () => {
  beforeEach(() => {
    globalThis.__gameKV = new MemoryKV();
    setStatsKVForTests(createMemoryStatsKV());
  });
  afterEach(() => {
    globalThis.__gameKV = undefined;
    setStatsKVForTests(undefined);
  });

  it('persists a call and a fold-win through the store pipeline', async () => {
    const { gameId, hostId } = await createNewGame({ hostName: 'Ada' });
    const guestId = 'u_guest';
    await withGame(gameId, () => ({ type: 'requestSeat', playerId: guestId, name: 'Pat', seat: 1 }));
    await withGame(gameId, () => ({ type: 'approveSeat', byId: hostId, playerId: guestId }));
    await withGame(gameId, () => ({ type: 'startGame', byId: hostId }));

    const started = await withGame(gameId);
    if (!started.ok) throw new Error('start read failed');
    const first = started.state.hand!.round.toAct!;
    const second = first === hostId ? guestId : hostId;

    await withGame(gameId, () => ({ type: 'playerAction', playerId: first, move: 'call' }));
    await withGame(gameId, () => ({ type: 'playerAction', playerId: second, move: 'fold' }));

    const snap = await readStatsSnapshot();
    expect(snap.house.handsPlayed).toBe(1);
    const ada = snap.players.find((p) => p.id === 'Ada');
    const pat = snap.players.find((p) => p.id === 'Pat');
    expect(ada?.handsDealt).toBe(1);
    expect(pat?.handsDealt).toBe(1);
    expect((ada?.calls ?? 0) + (pat?.calls ?? 0)).toBe(1);
    expect((ada?.handsWon ?? 0) + (pat?.handsWon ?? 0)).toBe(1);
    expect((ada?.handsFolded ?? 0) + (pat?.handsFolded ?? 0)).toBe(1);
  });
});
