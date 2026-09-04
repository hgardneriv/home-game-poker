import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import type { GameState, Player, Street } from '@/engine/types';
import { maybeSendTurnPush, turnActor, turnJustStarted } from './turn-push';
import { createMemoryPushKV, markPlayerForeground, saveDeviceToken, setPushKVForTests } from './push-store';
import { setApnsSenderForTests } from './apns';

function player(id: string, extra: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    seat: 0,
    stack: 20,
    status: 'seated',
    timeBankMs: 10_000,
    isHost: id === 'p1',
    isBot: false,
    hasPlayed: true,
    lastSeenAt: 0,
    totalBuyIn: 20,
    topUpsUsed: 0,
    topUpAt: null,
    ...extra,
  };
}

function state(opts: {
  id?: string;
  phase?: GameState['phase'];
  toAct?: string | null;
  handNo?: number;
  street?: Street;
  players?: Record<string, Player>;
}): GameState {
  const toAct = opts.toAct === undefined ? 'p1' : opts.toAct;
  return {
    id: opts.id ?? 'g1',
    version: 1,
    phase: opts.phase ?? 'playing',
    config: {
      startingStack: 20,
      smallBlind: 1,
      bigBlind: 2,
      actionTimeMs: 20_000,
      timeBankMs: 10_000,
      maxSeats: 6,
      topUps: 0,
      topUpDecayPct: 50,
    },
    hostId: 'p1',
    hosted: false,
    players: opts.players ?? { p1: player('p1'), p2: player('p2', { seat: 1 }) },
    seats: ['p1', 'p2', null, null, null, null],
    seatRequests: [],
    hand: toAct
      ? ({
          handNo: opts.handNo ?? 1,
          deck: [],
          deckPos: 0,
          buttonSeat: 0,
          sbSeat: 0,
          deadSb: false,
          bbSeat: 1,
          holeCards: {},
          board: [],
          inHand: ['p1', 'p2'],
          folded: [],
          allIn: [],
          totalCommitted: {},
          round: {
            street: opts.street ?? 'preflop',
            currentBet: 2,
            lastFullRaiseSize: 2,
            lastFullRaiseTo: 2,
            committed: {},
            actedSinceFullRaise: [],
            lastAggressor: null,
            toAct,
            actionDeadline: 0,
            timeBankArmed: false,
            botActAt: null,
          },
          result: null,
        } as GameState['hand'])
      : null,
    prevBbSeat: null,
    nextHandAt: null,
    pauseAfterHand: false,
    endedReason: null,
    resultsShown: false,
    events: [],
    eventSeq: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

function stubApnsEnv() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  vi.stubEnv('APNS_KEY_ID', 'KEYID1234');
  vi.stubEnv('APNS_TEAM_ID', 'TEAMID1234');
  vi.stubEnv('APNS_KEY', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
}

afterEach(() => {
  setPushKVForTests(undefined);
  setApnsSenderForTests(undefined);
  vi.unstubAllEnvs();
});

describe('turnJustStarted', () => {
  it('returns the actor when the table first has a toAct', () => {
    expect(turnActor(state({ toAct: 'p1' }))).toEqual({
      playerId: 'p1',
      handNo: 1,
      street: 'preflop',
    });
    expect(turnJustStarted(null, state({ toAct: 'p1' }))).toBe('p1');
  });

  it('is silent when the same player is still to act on the same street', () => {
    const a = state({ toAct: 'p1', street: 'flop' });
    const b = state({ toAct: 'p1', street: 'flop' });
    expect(turnJustStarted(a, b)).toBeNull();
  });

  it('fires again when the street changes even if the player is the same', () => {
    const a = state({ toAct: 'p1', street: 'flop' });
    const b = state({ toAct: 'p1', street: 'turn' });
    expect(turnJustStarted(a, b)).toBe('p1');
  });

  it('fires when action moves to the other player', () => {
    expect(turnJustStarted(state({ toAct: 'p1' }), state({ toAct: 'p2' }))).toBe('p2');
  });

  it('is silent when nobody is to act', () => {
    expect(turnJustStarted(state({ toAct: 'p1' }), state({ toAct: null, phase: 'hand-over' }))).toBeNull();
  });
});

describe('maybeSendTurnPush', () => {
  it('does not send for bots, missing tokens, or when APNs is unset', async () => {
    setPushKVForTests(createMemoryPushKV());
    const sender = vi.fn(async () => ({ status: 200, invalidate: false }));
    setApnsSenderForTests(sender);

    await maybeSendTurnPush(null, state({ players: { bot: player('bot', { isBot: true }) }, toAct: 'bot' }));
    expect(sender).not.toHaveBeenCalled();

    await maybeSendTurnPush(null, state({ toAct: 'p1' }));
    expect(sender).not.toHaveBeenCalled();

    stubApnsEnv();
    await maybeSendTurnPush(null, state({ toAct: 'p1' }));
    expect(sender).not.toHaveBeenCalled();
  });

  it('skips a human who still has a live SSE foreground key', async () => {
    setPushKVForTests(createMemoryPushKV());
    stubApnsEnv();
    const sender = vi.fn(async () => ({ status: 200, invalidate: false }));
    setApnsSenderForTests(sender);
    await saveDeviceToken('g1', 'p1', 'a'.repeat(64));
    await markPlayerForeground('g1', 'p1');
    await maybeSendTurnPush(null, state({ toAct: 'p1' }));
    expect(sender).not.toHaveBeenCalled();
  });

  it('sends a your-turn alert and drops an invalidated token', async () => {
    setPushKVForTests(createMemoryPushKV());
    stubApnsEnv();
    const sender = vi.fn(async () => ({ status: 410, reason: 'Unregistered', invalidate: true }));
    setApnsSenderForTests(sender);
    await saveDeviceToken('g1', 'p1', 'b'.repeat(64));
    await maybeSendTurnPush(state({ toAct: 'p2' }), state({ toAct: 'p1' }));
    expect(sender).toHaveBeenCalledTimes(1);
    const { getDeviceToken } = await import('./push-store');
    expect(await getDeviceToken('g1', 'p1')).toBeNull();
  });

  it('swallows APNs transport errors so a game write cannot fail', async () => {
    setPushKVForTests(createMemoryPushKV());
    stubApnsEnv();
    setApnsSenderForTests(async () => {
      throw new Error('network');
    });
    await saveDeviceToken('g1', 'p1', 'c'.repeat(64));
    await expect(maybeSendTurnPush(null, state({ toAct: 'p1' }))).resolves.toBeUndefined();
  });

  it('does not send for a left or kicked player', async () => {
    setPushKVForTests(createMemoryPushKV());
    stubApnsEnv();
    const sender = vi.fn(async () => ({ status: 200, invalidate: false }));
    setApnsSenderForTests(sender);
    await saveDeviceToken('g1', 'p1', 'd'.repeat(64));
    await maybeSendTurnPush(
      null,
      state({ toAct: 'p1', players: { p1: player('p1', { status: 'left' }) } })
    );
    expect(sender).not.toHaveBeenCalled();
  });
});
