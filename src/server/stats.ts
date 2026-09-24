import { evaluate7 } from '@/engine/evaluator';
import {
  emptyHandCounts,
  EXPECTED_7CARD_RATES,
  HAND_KINDS,
  madeHandKind,
  rateTolerance,
  type HandCounts,
  type HandKind,
} from '@/engine/hand-category';
import type { GameEvent, GameState, HandState } from '@/engine/types';
import { getStatsKV, type StatsKV } from './stats-store';

/** Public leaderboard length. */
export const LEADERBOARD_CAP = 15;

const HOUSE_KEY = 'stats:house';
const BOTS_SET = 'stats:bots';
const PLAYERS_SET = 'stats:players';

function botHash(slug: string): string {
  return `stats:bot:${slug}`;
}
function playerHash(id: string): string {
  return `stats:player:${id}`;
}
function seenKey(fingerprint: string): string {
  return `stats:seen:${fingerprint}`;
}

/**
 * Leaderboard key is the display name — no accounts, no extra ids.
 * If `stats:player:{name}` exists, accumulate; else create it.
 */
export function playerStatsKey(name: string): string {
  return name.trim().slice(0, 20);
}

export function botSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

export interface CallTick {
  playerId: string;
  name: string;
  isBot: boolean;
  seq: number;
  at: number;
}

export interface HandActor {
  id: string;
  name: string;
  isBot: boolean;
  won: boolean;
  folded: boolean;
  net: number;
  made?: HandKind;
}

export interface HandDelta {
  fingerprint: string;
  cardsDealt: number;
  cardsPlayed: number;
  actors: HandActor[];
}

export interface GameEndDelta {
  fingerprint: string;
  winnerId: string | null;
  players: { id: string; name: string; isBot: boolean; hasPlayed: boolean }[];
}

export interface StatsDelta {
  gameId: string;
  calls: CallTick[];
  hand?: HandDelta;
  gameEnd?: GameEndDelta;
}

export interface HouseStats {
  handsPlayed: number;
  cardsDealt: number;
  cardsPlayed: number;
  handsEvaluated: number;
  hands: HandCounts;
}

export interface BotStats {
  slug: string;
  name: string;
  gameWins: number;
  gamesPlayed: number;
  handsDealt: number;
  handsWon: number;
  handsFolded: number;
  calls: number;
  handsEvaluated: number;
  hands: HandCounts;
}

export interface PlayerStats {
  id: string;
  name: string;
  gamesPlayed: number;
  handsDealt: number;
  handsWon: number;
  handsFolded: number;
  calls: number;
  money: number;
}

export interface StatsSnapshot {
  house: HouseStats;
  bots: BotStats[];
  players: PlayerStats[];
  expectedRates: Record<HandKind, number>;
  /** Absolute rate tolerance used by the frequency check, by expected rate. */
  toleranceNote: string;
}

export const TOLERANCE_NOTE =
  '±1.5pp for hands expected ≥2%, ±0.25pp for 0.1–2%, ±0.15pp for rarer (7-card Hold’em / C(52,7)).';

function newEvents(prev: GameState, next: GameState): GameEvent[] {
  if (next.eventSeq >= prev.eventSeq) {
    return next.events.filter((e) => e.seq > prev.eventSeq);
  }
  return next.events.filter((e) => e.type !== 'rematch');
}

function lastEventData<T>(events: GameEvent[], type: string): T | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === type) return events[i].data as T;
  }
  return null;
}

function payoutsOf(next: GameState, events: GameEvent[]): Record<string, number> {
  const fromNew = lastEventData<{ payouts?: Record<string, number> }>(events, 'hand-result');
  if (fromNew?.payouts) return fromNew.payouts;
  const fromAll = lastEventData<{ payouts?: Record<string, number> }>(next.events, 'hand-result');
  return fromAll?.payouts ?? {};
}

function buildHandDelta(next: GameState, events: GameEvent[]): HandDelta | undefined {
  const hand = next.hand;
  if (!hand?.result) return undefined;
  const inHand = hand.inHand;
  const cardsDealt = 2 * inHand.length + hand.board.length;
  const live = inHand.filter((id) => !hand.folded.includes(id));
  const cardsPlayed = 2 * live.length + hand.board.length;
  const payouts = payoutsOf(next, events);
  const river = hand.board.length === 5;
  const actors: HandActor[] = inHand.map((id) => {
    const p = next.players[id];
    const won = hand.result!.pots.some((pot) => pot.winners.includes(id));
    const folded = hand.folded.includes(id);
    const net = (payouts[id] ?? 0) - (hand.totalCommitted[id] ?? 0);
    let made: HandKind | undefined;
    if (river) {
      const hole = hand.holeCards[id];
      if (hole) made = madeHandKind(evaluate7([...hole, ...hand.board]));
    }
    return {
      id,
      name: p?.name ?? id,
      isBot: p?.isBot ?? false,
      won,
      folded,
      net,
      made,
    };
  });
  return {
    fingerprint: handFingerprint(next.id, hand),
    cardsDealt,
    cardsPlayed,
    actors,
  };
}

function handFingerprint(gameId: string, hand: HandState): string {
  return `h:${gameId}:${hand.handNo}:${hand.board.join('')}:${hand.inHand.join(',')}`;
}

function buildGameEnd(next: GameState, events: GameEvent[]): GameEndDelta {
  const data = lastEventData<{ winnerId?: string | null }>(events, 'game-ended')
    ?? lastEventData<{ winnerId?: string | null }>(next.events, 'game-ended');
  const winnerId = data?.winnerId ?? null;
  const players = Object.values(next.players).map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    hasPlayed: p.hasPlayed,
  }));
  return {
    fingerprint: `g:${next.id}:${next.updatedAt}:${next.endedReason ?? ''}:${winnerId ?? ''}:${next.hand?.handNo ?? 0}`,
    winnerId,
    players,
  };
}

function isNewHandResult(prev: GameState, next: GameState): boolean {
  if (!next.hand?.result) return false;
  if (!prev.hand) return true;
  if (!prev.hand.result) return true;
  return prev.hand.handNo !== next.hand.handNo;
}

/** Pure: stats implied by one engine apply (prev → next). */
export function extractStatsDelta(prev: GameState, next: GameState): StatsDelta | null {
  const events = newEvents(prev, next);
  const calls: CallTick[] = [];
  for (const e of events) {
    if (e.type !== 'action') continue;
    const data = e.data as { playerId?: string; move?: string };
    if (data.move !== 'call' || !data.playerId) continue;
    const p = next.players[data.playerId];
    if (!p) continue;
    calls.push({ playerId: p.id, name: p.name, isBot: p.isBot, seq: e.seq, at: e.at });
  }

  const hand = isNewHandResult(prev, next) ? buildHandDelta(next, events) : undefined;
  const gameEnd =
    prev.phase !== 'ended' && next.phase === 'ended' ? buildGameEnd(next, events) : undefined;

  if (!calls.length && !hand && !gameEnd) return null;
  return { gameId: next.id, calls, hand, gameEnd };
}

function intField(hash: Record<string, string>, field: string): number {
  const n = Number(hash[field] ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function handCountsFrom(hash: Record<string, string>): HandCounts {
  const counts = emptyHandCounts();
  for (const kind of HAND_KINDS) counts[kind] = intField(hash, kind);
  return counts;
}

function emptyHouse(): HouseStats {
  return {
    handsPlayed: 0,
    cardsDealt: 0,
    cardsPlayed: 0,
    handsEvaluated: 0,
    hands: emptyHandCounts(),
  };
}

function houseFrom(hash: Record<string, string>): HouseStats {
  return {
    handsPlayed: intField(hash, 'handsPlayed'),
    cardsDealt: intField(hash, 'cardsDealt'),
    cardsPlayed: intField(hash, 'cardsPlayed'),
    handsEvaluated: intField(hash, 'handsEvaluated'),
    hands: handCountsFrom(hash),
  };
}

function botFrom(slug: string, hash: Record<string, string>): BotStats {
  return {
    slug,
    name: hash.name || slug,
    gameWins: intField(hash, 'gameWins'),
    gamesPlayed: intField(hash, 'gamesPlayed'),
    handsDealt: intField(hash, 'handsDealt'),
    handsWon: intField(hash, 'handsWon'),
    handsFolded: intField(hash, 'handsFolded'),
    calls: intField(hash, 'calls'),
    handsEvaluated: intField(hash, 'handsEvaluated'),
    hands: handCountsFrom(hash),
  };
}

function playerFrom(id: string, hash: Record<string, string>): PlayerStats {
  return {
    id,
    name: hash.name || id,
    gamesPlayed: intField(hash, 'gamesPlayed'),
    handsDealt: intField(hash, 'handsDealt'),
    handsWon: intField(hash, 'handsWon'),
    handsFolded: intField(hash, 'handsFolded'),
    calls: intField(hash, 'calls'),
    money: intField(hash, 'money'),
  };
}

async function bumpActor(
  kv: StatsKV,
  actor: { name: string; isBot: boolean },
  fields: Record<string, number>
): Promise<void> {
  if (actor.isBot) {
    const slug = botSlug(actor.name);
    if (!slug) return;
    await kv.sadd(BOTS_SET, slug);
    await kv.hset(botHash(slug), { name: actor.name, slug });
    for (const [field, n] of Object.entries(fields)) {
      await kv.incrBy(botHash(slug), field, n);
    }
    return;
  }
  const id = playerStatsKey(actor.name);
  if (!id) return;
  await kv.sadd(PLAYERS_SET, id);
  await kv.hset(playerHash(id), { name: actor.name });
  for (const [field, n] of Object.entries(fields)) {
    await kv.incrBy(playerHash(id), field, n);
  }
}

async function persistCalls(kv: StatsKV, delta: StatsDelta): Promise<void> {
  for (const call of delta.calls) {
    const fp = `c:${delta.gameId}:${call.seq}:${call.at}:${call.playerId}`;
    if (!(await kv.setnx(seenKey(fp), '1'))) continue;
    await bumpActor(kv, call, { calls: 1 });
  }
}

async function persistHand(kv: StatsKV, delta: StatsDelta): Promise<void> {
  const hand = delta.hand;
  if (!hand) return;
  if (!(await kv.setnx(seenKey(hand.fingerprint), '1'))) return;
  await kv.incrBy(HOUSE_KEY, 'handsPlayed', 1);
  await kv.incrBy(HOUSE_KEY, 'cardsDealt', hand.cardsDealt);
  await kv.incrBy(HOUSE_KEY, 'cardsPlayed', hand.cardsPlayed);
  for (const actor of hand.actors) {
    const fields: Record<string, number> = {
      handsDealt: 1,
      handsWon: actor.won ? 1 : 0,
      handsFolded: actor.folded ? 1 : 0,
      money: actor.isBot ? 0 : actor.net,
    };
    if (actor.made) {
      fields[actor.made] = 1;
      fields.handsEvaluated = 1;
      await kv.incrBy(HOUSE_KEY, actor.made, 1);
      await kv.incrBy(HOUSE_KEY, 'handsEvaluated', 1);
    }
    await bumpActor(kv, actor, fields);
  }
}

async function persistGameEnd(kv: StatsKV, delta: StatsDelta): Promise<void> {
  const end = delta.gameEnd;
  if (!end) return;
  if (!(await kv.setnx(seenKey(end.fingerprint), '1'))) return;
  const winner = end.winnerId ? end.players.find((p) => p.id === end.winnerId) : undefined;
  for (const p of end.players) {
    if (!p.hasPlayed) continue;
    await bumpActor(kv, p, { gamesPlayed: 1 });
  }
  if (winner?.hasPlayed) await bumpActor(kv, winner, { gameWins: 1 });
}

export async function persistStatsDeltas(deltas: StatsDelta[], kv: StatsKV = getStatsKV()): Promise<void> {
  for (const delta of deltas) {
    await persistCalls(kv, delta);
    await persistHand(kv, delta);
    await persistGameEnd(kv, delta);
  }
}

export async function readStatsSnapshot(kv: StatsKV = getStatsKV()): Promise<StatsSnapshot> {
  const house = houseFrom(await kv.hgetall(HOUSE_KEY));
  const botSlugs = await kv.smembers(BOTS_SET);
  const bots: BotStats[] = [];
  for (const slug of botSlugs) {
    const hash = await kv.hgetall(botHash(slug));
    if (!hash.name && !intField(hash, 'gameWins') && !intField(hash, 'handsDealt') && !intField(hash, 'calls')) {
      continue;
    }
    bots.push(botFrom(slug, hash));
  }
  bots.sort((a, b) => b.gameWins - a.gameWins || b.handsWon - a.handsWon || a.name.localeCompare(b.name));

  const playerIds = await kv.smembers(PLAYERS_SET);
  const players: PlayerStats[] = [];
  for (const id of playerIds) {
    const hash = await kv.hgetall(playerHash(id));
    const row = playerFrom(id, hash);
    // Hide kicked-only / throwaway seats that never took a card.
    if (row.handsDealt <= 0) continue;
    players.push(row);
  }
  players.sort((a, b) => b.money - a.money || b.handsWon - a.handsWon || b.gamesPlayed - a.gamesPlayed);
  return {
    house: house.handsPlayed || house.cardsDealt ? house : emptyHouse(),
    bots,
    players: players.slice(0, LEADERBOARD_CAP),
    expectedRates: EXPECTED_7CARD_RATES,
    toleranceNote: TOLERANCE_NOTE,
  };
}

export async function readBotStats(slug: string, kv: StatsKV = getStatsKV()): Promise<BotStats | null> {
  const hash = await kv.hgetall(botHash(slug));
  if (!hash.name && !intField(hash, 'calls') && !intField(hash, 'handsDealt') && !intField(hash, 'gameWins')) {
    return null;
  }
  return botFrom(slug, hash);
}

export { EXPECTED_7CARD_RATES, rateTolerance };
