import type { Card, GameState, Street } from '@/engine/types';

/**
 * Named flop setups for README screenshots. Local-dev only — the rig route
 * 404s unless ALLOW_TABLE_RIG=1. Each layout is a real mid-hand: three
 * players still in, two blinds posted, the rest folded.
 */
export const DEMO_HANDS = ['pair-twos', 'trips-kings', 'full-house'] as const;
export type DemoHand = (typeof DEMO_HANDS)[number];

export function isDemoHand(value: string): value is DemoHand {
  return (DEMO_HANDS as readonly string[]).includes(value);
}

interface Setup {
  hole: [Card, Card];
  board: Card[];
  street: Street;
  /** Street bet already in front of the hero (0 = checked to the button). */
  heroStreetBet: number;
  /** Flop chips in front of the blinds so the table shows a live street. */
  sbStreetBet?: number;
  bbStreetBet?: number;
}

const SETUPS: Record<DemoHand, Setup> = {
  // Same texture as the original July 2026 shot — pair of deuces on the flop.
  'pair-twos': {
    hole: ['4h', '2c'],
    board: ['Tc', '2s', 'Kc'],
    street: 'flop',
    heroStreetBet: 0,
    sbStreetBet: 4,
    bbStreetBet: 4,
  },
  'trips-kings': {
    hole: ['Kh', 'Kd'],
    board: ['Kc', '7s', '4d'],
    street: 'flop',
    heroStreetBet: 4,
    bbStreetBet: 4,
  },
  'full-house': {
    hole: ['Ah', 'Ad'],
    board: ['Ac', 'Kh', 'Kd'],
    street: 'flop',
    heroStreetBet: 6,
    bbStreetBet: 6,
  },
};

const DECK: Card[] = [];
for (const r of ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']) {
  for (const s of ['s', 'h', 'd', 'c']) DECK.push(`${r}${s}`);
}

/**
 * Rewrite the current hand into a frozen, chip-consistent demo. Hero is the
 * button; blinds sit on the next two seats; timers sit an hour out so the
 * sweep cannot advance the table while we screenshot.
 */
export function applyDemoHand(state: GameState, setup: DemoHand, now: number): GameState {
  const next = structuredClone(state);
  const hand = next.hand;
  if (!hand) throw new Error('applyDemoHand: no hand dealt');

  const heroId = next.hostId;
  const hero = next.players[heroId];
  if (!hero || hero.seat === null) throw new Error('applyDemoHand: host is not seated');

  const spec = SETUPS[setup];
  const used = new Set<Card>([...spec.hole, ...spec.board]);
  const leftover = DECK.filter((c) => !used.has(c));

  const seated = next.seats
    .map((id, seat) => (id ? { id, seat } : null))
    .filter((x): x is { id: string; seat: number } => x !== null);

  const buttonSeat = hero.seat;
  const max = next.config.maxSeats;
  const clockwise = (from: number) =>
    seated.filter((p) => p.seat !== from).sort((a, b) => {
      const da = (a.seat - from + max) % max;
      const db = (b.seat - from + max) % max;
      return da - db;
    });

  const afterButton = clockwise(buttonSeat);
  const sb = afterButton[0];
  const bb = afterButton[1];
  const liveIds = new Set([heroId, sb?.id, bb?.id].filter(Boolean) as string[]);

  hand.buttonSeat = buttonSeat;
  hand.sbSeat = sb?.seat ?? (buttonSeat + 1) % max;
  hand.bbSeat = bb?.seat ?? (buttonSeat + 2) % max;
  hand.deadSb = false;
  hand.board = [...spec.board];
  hand.folded = seated.map((p) => p.id).filter((id) => !liveIds.has(id));
  hand.allIn = [];
  hand.inHand = afterButton.map((p) => p.id);
  if (!hand.inHand.includes(heroId)) hand.inHand.push(heroId);

  hand.holeCards = {};
  let deckI = 0;
  for (const p of seated) {
    hand.holeCards[p.id] =
      p.id === heroId ? [spec.hole[0], spec.hole[1]] : [leftover[deckI++], leftover[deckI++]];
  }
  hand.deck = leftover.slice(deckI);
  hand.deckPos = 0;

  const buyIn = next.config.startingStack;
  const sbAmt = next.config.smallBlind;
  const bbAmt = next.config.bigBlind;
  hand.totalCommitted = {};
  for (const p of Object.values(next.players)) {
    p.stack = buyIn;
    p.status = p.seat !== null ? 'seated' : p.status;
    hand.totalCommitted[p.id] = 0;
  }
  if (sb) {
    next.players[sb.id].stack -= sbAmt;
    hand.totalCommitted[sb.id] = sbAmt;
  }
  if (bb) {
    next.players[bb.id].stack -= bbAmt;
    hand.totalCommitted[bb.id] = bbAmt;
  }
  next.players[heroId].stack -= bbAmt;
  hand.totalCommitted[heroId] = bbAmt;

  const othersIn = [sb?.id, bb?.id].filter((id): id is string => !!id);
  const streetBet = spec.heroStreetBet;
  const sbStreet = spec.sbStreetBet ?? 0;
  const bbStreet = spec.bbStreetBet ?? 0;
  if (streetBet > 0) {
    next.players[heroId].stack -= streetBet;
    hand.totalCommitted[heroId] += streetBet;
  }
  if (sb && sbStreet > 0) {
    next.players[sb.id].stack -= sbStreet;
    hand.totalCommitted[sb.id] += sbStreet;
  }
  if (bb && bbStreet > 0) {
    next.players[bb.id].stack -= bbStreet;
    hand.totalCommitted[bb.id] += bbStreet;
  }

  const committed: Record<string, number> = {};
  if (streetBet > 0) committed[heroId] = streetBet;
  if (sb && sbStreet > 0) committed[sb.id] = sbStreet;
  if (bb && bbStreet > 0) committed[bb.id] = bbStreet;
  const currentBet = Math.max(streetBet, sbStreet, bbStreet);
  const heroFacesABet = currentBet > streetBet;
  const acted = [
    ...(streetBet > 0 ? [heroId] : []),
    ...(sb && sbStreet > 0 ? [sb.id] : []),
    ...(bb && bbStreet > 0 ? [bb.id] : []),
  ];

  hand.round = {
    street: spec.street,
    currentBet,
    lastFullRaiseSize: currentBet > 0 ? currentBet : bbAmt,
    lastFullRaiseTo: currentBet,
    committed,
    actedSinceFullRaise: acted,
    lastAggressor: bb && bbStreet > 0 ? bb.id : streetBet > 0 ? heroId : null,
    toAct: heroFacesABet ? heroId : streetBet > 0 ? (othersIn[0] ?? null) : heroId,
    actionDeadline: now + 3_600_000,
    timeBankArmed: false,
    botActAt: heroFacesABet ? null : streetBet > 0 ? now + 3_600_000 : null,
  };
  hand.result = null;

  next.phase = 'playing';
  next.nextHandAt = null;
  next.pauseAfterHand = false;
  next.updatedAt = now;
  return next;
}
