import type {
  Action,
  EngineCtx,
  EngineResult,
  GameEvent,
  GameState,
  HandState,
  Player,
  TableConfig,
} from './types';
import { newDeck, shuffle } from './deck';
import { computePositions, eligiblePlayers, isEligible } from './seating';
import {
  actors,
  active,
  applyMove,
  firstToAct,
  getLegalActions,
  nextToAct,
} from './betting';
import { resolveFoldWin, resolveShowdown } from './showdown';
import { topUpAmount } from './topup';

export { getLegalActions };

const EVENT_CAP = 100;
/** Pause between hands so clients can show the result. */
const HAND_OVER_MS = { foldWin: 2500, showdown: 5000 };
/** How long a game-deciding bust holds the table open for a rebuy. */
const TOP_UP_WINDOW_MS = 20_000;
/** Bots "think" for a moment so play feels natural. */
const BOT_DELAY_BASE_MS = 800;
const BOT_DELAY_JITTER_MS = 1400;

export const DEFAULT_CONFIG: TableConfig = {
  startingStack: 20,
  smallBlind: 1,
  bigBlind: 2,
  actionTimeMs: 20_000,
  timeBankMs: 10_000,
  maxSeats: 6,
  topUps: 0,
  topUpDecayPct: 50,
};

export function normalizeConfig(partial: Partial<TableConfig>): TableConfig {
  const cfg = { ...DEFAULT_CONFIG, ...partial, maxSeats: 6 };
  cfg.startingStack = clampInt(cfg.startingStack, 2, 10_000, DEFAULT_CONFIG.startingStack);
  cfg.smallBlind = clampInt(cfg.smallBlind, 1, cfg.startingStack, 1);
  cfg.bigBlind = clampInt(cfg.bigBlind, cfg.smallBlind, cfg.startingStack, 2);
  cfg.actionTimeMs = clampInt(cfg.actionTimeMs, 5_000, 120_000, DEFAULT_CONFIG.actionTimeMs);
  cfg.timeBankMs = clampInt(cfg.timeBankMs, 0, 60_000, DEFAULT_CONFIG.timeBankMs);
  cfg.topUps = clampInt(cfg.topUps, 0, 20, DEFAULT_CONFIG.topUps);
  cfg.topUpDecayPct = clampInt(cfg.topUpDecayPct, 0, 100, DEFAULT_CONFIG.topUpDecayPct);
  return cfg;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function createGame(opts: {
  id: string;
  hostId: string;
  hostName: string;
  config?: Partial<TableConfig>;
  now: number;
  /** Invite-link table. Default true; quick play passes false. */
  hosted?: boolean;
}): GameState {
  const config = normalizeConfig(opts.config ?? {});
  const host: Player = {
    id: opts.hostId,
    name: opts.hostName,
    seat: 0,
    stack: config.startingStack,
    status: 'seated',
    timeBankMs: config.timeBankMs,
    isHost: true,
    isBot: false,
    hasPlayed: false,
    lastSeenAt: opts.now,
    totalBuyIn: config.startingStack,
    topUpsUsed: 0,
    topUpAt: null,
  };
  return {
    id: opts.id,
    version: 0,
    phase: 'lobby',
    config,
    hostId: opts.hostId,
    hosted: opts.hosted !== false,
    players: { [opts.hostId]: host },
    seats: [opts.hostId, null, null, null, null, null],
    seatRequests: [],
    hand: null,
    prevBbSeat: null,
    nextHandAt: null,
    pauseAfterHand: false,
    endedReason: null,
    resultsShown: false,
    events: [],
    eventSeq: 0,
    createdAt: opts.now,
    updatedAt: opts.now,
  };
}

const BOT_NAMES = ['Lucky Lou', 'Raisin Rita', 'Callin Carl', 'Foldin Fred', 'Bluffy', 'Chip Chaplin'];

// ---------------------------------------------------------------------------

type Mutable = { state: GameState; events: GameEvent[]; ctx: EngineCtx };

function emit(m: Mutable, type: string, data: unknown = {}): void {
  const event: GameEvent = { seq: ++m.state.eventSeq, at: m.ctx.now, type, data };
  m.state.events.push(event);
  if (m.state.events.length > EVENT_CAP) m.state.events.splice(0, m.state.events.length - EVENT_CAP);
  m.events.push(event);
}

function fail(code: string, message: string): EngineResult {
  return { ok: false, error: { code, message } } as EngineResult;
}

function succeed(m: Mutable): EngineResult {
  return { ok: true, state: m.state, events: m.events };
}

function requireHost(m: Mutable, byId: string): EngineResult | null {
  return byId === m.state.hostId ? null : fail('not-host', 'Only the host can do that');
}

/** Entry point: apply one action to an immutable state, returning the new state. */
export function applyAction(prev: GameState, action: Action, ctx: EngineCtx): EngineResult {
  const state = structuredClone(prev);
  const m: Mutable = { state, events: [], ctx };
  state.updatedAt = ctx.now;

  switch (action.type) {
    case 'requestSeat':
      return applyRequestSeat(m, action);
    case 'approveSeat':
      return applyApproveSeat(m, action);
    case 'denySeat':
      return applyDenySeat(m, action);
    case 'startGame':
      return applyStartGame(m, action);
    case 'playerAction':
      return applyPlayerAction(m, action);
    case 'timeout':
      return applyTimeout(m);
    case 'nextHand':
      return applyNextHand(m);
    case 'pause':
      return applyPause(m, action);
    case 'resume':
      return applyResume(m, action);
    case 'playAgain':
      return applyPlayAgain(m, action);
    case 'showResults':
      return applyShowResults(m, action);
    case 'endGame':
      return applyHostEndGame(m, action);
    case 'kick':
      return applyKick(m, action);
    case 'leave':
      return applyLeave(m, action);
    case 'addBot':
      return applyAddBot(m, action);
    case 'removeBot':
      return applyRemoveBot(m, action);
    case 'imBack':
      return applyImBack(m, action);
    case 'topUp':
      return applyTopUp(m, action);
  }
}

function applyRequestSeat(m: Mutable, action: Extract<Action, { type: 'requestSeat' }>): EngineResult {
  const { state, ctx } = m;
  if (state.phase === 'ended') return fail('bad-phase', 'Game is over');
  if (state.players[action.playerId]) return fail('noop', 'Already in the game');
  const name = action.name.trim().slice(0, 20);
  if (!name) return fail('bad-amount', 'Name required');
  const hasRoom =
    state.seats.some((s) => s === null) ||
    Object.values(state.players).some((p) => p.isBot && p.seat !== null);
  if (!hasRoom) return fail('game-full', 'Table is full');
  state.players[action.playerId] = {
    id: action.playerId,
    name,
    seat: null,
    stack: state.config.startingStack,
    status: 'seated',
    timeBankMs: state.config.timeBankMs,
    isHost: false,
    isBot: false,
    hasPlayed: false,
    lastSeenAt: ctx.now,
    totalBuyIn: state.config.startingStack,
    topUpsUsed: 0,
    topUpAt: null,
  };
  state.seatRequests.push({
    playerId: action.playerId,
    name,
    seat: clampInt(action.seat, 0, 5, 0),
    at: ctx.now,
  });
  emit(m, 'seat-requested', { playerId: action.playerId, name });
  return succeed(m);
}

function applyApproveSeat(m: Mutable, action: Extract<Action, { type: 'approveSeat' }>): EngineResult {
  const { state } = m;
  const notHost = requireHost(m, action.byId);
  if (notHost) return notHost;
  const req = state.seatRequests.find((r) => r.playerId === action.playerId);
  if (!req) return fail('unknown-player', 'No such seat request');
  state.seatRequests = state.seatRequests.filter((r) => r.playerId !== action.playerId);

  let seat = state.seats[req.seat] === null ? req.seat : state.seats.indexOf(null);
  if (seat === -1) {
    // Full table: the newest bot yields its seat (folding mid-hand if needed).
    const bots = Object.values(state.players).filter((p) => p.isBot && p.seat !== null);
    const newest = bots[bots.length - 1];
    if (!newest) return fail('game-full', 'Table is full');
    removePlayer(m, newest.id, 'left');
    seat = state.seats.indexOf(null);
  }
  const player = state.players[action.playerId];
  player.seat = seat;
  state.seats[seat] = player.id;
  emit(m, 'player-seated', { playerId: player.id, name: player.name, seat });
  return succeed(m);
}

function applyDenySeat(m: Mutable, action: Extract<Action, { type: 'denySeat' }>): EngineResult {
  const { state } = m;
  const notHost = requireHost(m, action.byId);
  if (notHost) return notHost;
  if (!state.seatRequests.some((r) => r.playerId === action.playerId))
    return fail('unknown-player', 'No such seat request');
  state.seatRequests = state.seatRequests.filter((r) => r.playerId !== action.playerId);
  delete state.players[action.playerId];
  emit(m, 'seat-denied', { playerId: action.playerId });
  return succeed(m);
}

function applyStartGame(m: Mutable, action: Extract<Action, { type: 'startGame' }>): EngineResult {
  const { state } = m;
  const notHost = requireHost(m, action.byId);
  if (notHost) return notHost;
  if (state.phase !== 'lobby') return fail('bad-phase', 'Game already started');
  if (eligiblePlayers(state).length < 2)
    return fail('bad-phase', 'Need at least 2 players');
  startHand(m);
  return succeed(m);
}

function applyPlayerAction(m: Mutable, action: Extract<Action, { type: 'playerAction' }>): EngineResult {
  const { state, ctx } = m;
  if (state.phase !== 'playing' || !state.hand)
    return fail('bad-phase', 'No hand in progress');
  const hand = state.hand;
  if (hand.round.toAct !== action.playerId)
    return fail('not-your-turn', 'Not your turn');
  const player = state.players[action.playerId];
  if (player.status === 'away') {
    player.status = 'seated';
    emit(m, 'player-back', { playerId: player.id });
  }
  player.lastSeenAt = ctx.now;
  const res = applyMove(state, action.playerId, action.move, action.amount);
  if ('error' in res) return fail(res.error.code, res.error.message);
  emit(m, 'action', {
    playerId: action.playerId,
    move: res.applied.move,
    amount: res.applied.amount,
    street: hand.round.street,
    auto: false,
  });
  hand.round.toAct = nextToAct(hand, action.playerId);
  hand.round.actionDeadline = null;
  hand.round.botActAt = null;
  advance(m);
  return succeed(m);
}

function applyNextHand(m: Mutable): EngineResult {
  const { state, ctx } = m;
  if (state.phase !== 'hand-over') return fail('bad-phase', 'No hand pending');
  if (state.nextHandAt === null || ctx.now < state.nextHandAt)
    return fail('not-expired', 'Next hand not due yet');
  startHand(m);
  return succeed(m);
}

function applyPause(m: Mutable, action: Extract<Action, { type: 'pause' }>): EngineResult {
  const { state } = m;
  const notHost = requireHost(m, action.byId);
  if (notHost) return notHost;
  if (state.phase === 'playing') {
    state.pauseAfterHand = true;
    emit(m, 'pause-requested', {});
  } else if (state.phase === 'hand-over') {
    state.phase = 'paused';
    state.nextHandAt = null;
    emit(m, 'paused', {});
  } else {
    return fail('bad-phase', 'Nothing to pause');
  }
  return succeed(m);
}

function applyResume(m: Mutable, action: Extract<Action, { type: 'resume' }>): EngineResult {
  const { state, ctx } = m;
  const notHost = requireHost(m, action.byId);
  if (notHost) return notHost;
  if (state.phase !== 'paused') return fail('bad-phase', 'Not paused');
  state.pauseAfterHand = false;
  state.phase = 'hand-over';
  state.nextHandAt = ctx.now + 1500;
  emit(m, 'resumed', {});
  return succeed(m);
}

function applyShowResults(m: Mutable, action: Extract<Action, { type: 'showResults' }>): EngineResult {
  const { state } = m;
  const notHost = requireHost(m, action.byId);
  if (notHost) return notHost;
  if (state.phase !== 'ended') return fail('bad-phase', 'Game is not over');
  if (state.resultsShown || !state.hand?.result)
    return fail('bad-phase', 'Results already shown');
  state.resultsShown = true;
  emit(m, 'results-shown', {});
  return succeed(m);
}

function applyHostEndGame(m: Mutable, action: Extract<Action, { type: 'endGame' }>): EngineResult {
  const { state } = m;
  const notHost = requireHost(m, action.byId);
  if (notHost) return notHost;
  if (state.phase === 'ended') return fail('bad-phase', 'Game is already over');
  // Return any chips still in the pot to their owners so final standings
  // reflect real money, then discard the unfinished hand.
  if (state.hand && !state.hand.result) {
    for (const [id, amount] of Object.entries(state.hand.totalCommitted)) {
      state.players[id].stack += amount;
    }
  }
  state.hand = null;
  endGame(m, null, 'host');
  return succeed(m);
}

function applyKick(m: Mutable, action: Extract<Action, { type: 'kick' }>): EngineResult {
  const { state } = m;
  const notHost = requireHost(m, action.byId);
  if (notHost) return notHost;
  if (action.playerId === state.hostId) return fail('illegal-move', 'Host cannot kick self');
  if (!state.players[action.playerId]) return fail('unknown-player', 'No such player');
  removePlayer(m, action.playerId, 'kicked');
  return succeed(m);
}

function applyLeave(m: Mutable, action: Extract<Action, { type: 'leave' }>): EngineResult {
  const { state } = m;
  if (!state.players[action.playerId]) return fail('unknown-player', 'No such player');
  removePlayer(m, action.playerId, 'left');
  return succeed(m);
}

function applyAddBot(m: Mutable, action: Extract<Action, { type: 'addBot' }>): EngineResult {
  const { state, ctx } = m;
  const notHost = requireHost(m, action.byId);
  if (notHost) return notHost;
  if (state.phase === 'ended') return fail('bad-phase', 'Game is over');
  const seat = state.seats.indexOf(null);
  if (seat === -1) return fail('game-full', 'No open seat');
  const used = new Set(Object.values(state.players).map((p) => p.name));
  const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${state.eventSeq}`;
  const id = `bot_${state.id}_${state.eventSeq}_${ctx.randInt(1_000_000)}`;
  state.players[id] = {
    id,
    name,
    seat,
    stack: state.config.startingStack,
    status: 'seated',
    timeBankMs: 0,
    isHost: false,
    isBot: true,
    bot: {
      tightness: 0.3 + ctx.randInt(40) / 100,
      aggression: 0.3 + ctx.randInt(50) / 100,
      bluffFreq: 0.05 + ctx.randInt(20) / 100,
    },
    hasPlayed: false,
    lastSeenAt: ctx.now,
    totalBuyIn: state.config.startingStack,
    topUpsUsed: 0,
    topUpAt: null,
  };
  state.seats[seat] = id;
  emit(m, 'player-seated', { playerId: id, name, seat, isBot: true });
  return succeed(m);
}

function applyRemoveBot(m: Mutable, action: Extract<Action, { type: 'removeBot' }>): EngineResult {
  const { state } = m;
  const notHost = requireHost(m, action.byId);
  if (notHost) return notHost;
  const bot = state.players[action.playerId];
  if (!bot?.isBot) return fail('unknown-player', 'No such bot');
  removePlayer(m, action.playerId, 'left');
  return succeed(m);
}

function applyImBack(m: Mutable, action: Extract<Action, { type: 'imBack' }>): EngineResult {
  const { state, ctx } = m;
  const player = state.players[action.playerId];
  if (!player) return fail('unknown-player', 'No such player');
  player.lastSeenAt = ctx.now;
  if (player.status === 'away') {
    player.status = 'seated';
    emit(m, 'player-back', { playerId: player.id });
    // If they returned on their own turn, give them a fresh clock instead
    // of the instant auto-fold an away player would get.
    const round = state.hand?.round;
    if (state.phase === 'playing' && round?.toAct === player.id) {
      round.actionDeadline = ctx.now + state.config.actionTimeMs;
      round.timeBankArmed = false;
    }
  }
  return succeed(m);
}

function applyTimeout(m: Mutable): EngineResult {
  const { state, ctx } = m;
  if (state.phase !== 'playing' || !state.hand) return fail('bad-phase', 'No hand');
  const hand = state.hand;
  const acting = hand.round.toAct;
  if (!acting || hand.round.actionDeadline === null)
    return fail('not-expired', 'No one is on the clock');
  if (ctx.now < hand.round.actionDeadline)
    return fail('not-expired', 'Timer has not expired');
  const player = state.players[acting];

  if (!player.isBot && !hand.round.timeBankArmed && player.timeBankMs > 0) {
    hand.round.actionDeadline += player.timeBankMs;
    hand.round.timeBankArmed = true;
    emit(m, 'time-bank', { playerId: acting, extraMs: player.timeBankMs });
    player.timeBankMs = 0;
    return succeed(m);
  }

  const legal = getLegalActions(state, acting)!;
  const move = legal.canCheck ? 'check' : 'fold';
  applyMove(state, acting, move, undefined);
  emit(m, 'action', {
    playerId: acting,
    move,
    amount: 0,
    street: hand.round.street,
    auto: true,
  });
  if (!player.isBot && player.status === 'seated') {
    player.status = 'away';
    emit(m, 'player-away', { playerId: acting });
  }
  hand.round.toAct = nextToAct(hand, acting);
  hand.round.actionDeadline = null;
  hand.round.botActAt = null;
  advance(m);
  return succeed(m);
}

function applyPlayAgain(m: Mutable, action: Extract<Action, { type: 'playAgain' }>): EngineResult {
  const { state, ctx } = m;
  const player = state.players[action.playerId];
  if (!player) return fail('unknown-player', 'No such player');
  if (player.isBot || player.status === 'kicked' || player.status === 'left')
    return fail('illegal-move', 'Only players at the table can rematch');
  if (state.hosted === false) return fail('bad-phase', 'Quick play starts a new table');
  if (state.phase === 'lobby') return succeed(m);
  if (state.phase !== 'ended') return fail('bad-phase', 'Game is still going');

  // Same table, same setup: blinds, top-ups, stacks, timers stay as the
  // host configured them. Seated bots stay; only chips and phase reset.
  const buyIn = state.config.startingStack;
  for (const p of Object.values(state.players)) {
    if (p.status === 'kicked' || p.status === 'left') continue;
    p.stack = buyIn;
    p.totalBuyIn = buyIn;
    p.topUpsUsed = 0;
    p.topUpAt = null;
    p.timeBankMs = state.config.timeBankMs;
    p.hasPlayed = false;
    p.status = 'seated';
    p.lastSeenAt = ctx.now;
  }
  state.hand = null;
  state.prevBbSeat = null;
  state.nextHandAt = null;
  state.pauseAfterHand = false;
  state.endedReason = null;
  state.resultsShown = false;
  state.seatRequests = [];
  state.events = [];
  state.eventSeq = 0;
  state.phase = 'lobby';
  emit(m, 'rematch', {});
  return succeed(m);
}

function applyTopUp(m: Mutable, action: Extract<Action, { type: 'topUp' }>): EngineResult {
  const { state, ctx } = m;
  const player = state.players[action.playerId];
  if (!player) return fail('unknown-player', 'No such player');
  if (state.phase === 'ended') return fail('bad-phase', 'Game is over');
  if (state.phase === 'lobby') return fail('bad-phase', 'Game has not started');
  if (player.status !== 'busted' || player.seat === null)
    return fail('illegal-move', 'You still have chips');
  const amount = topUpAmount(state.config, player.topUpsUsed ?? 0);
  if (amount <= 0) return fail('illegal-move', 'No top-ups remaining');

  player.stack = amount;
  player.totalBuyIn = (player.totalBuyIn ?? state.config.startingStack) + amount;
  player.topUpsUsed = (player.topUpsUsed ?? 0) + 1;
  player.status = 'seated';
  player.topUpAt = null;
  player.lastSeenAt = ctx.now;
  emit(m, 'topped-up', {
    playerId: player.id,
    amount,
    remaining: state.config.topUps - player.topUpsUsed,
  });

  // If this rebuy revived a game that was holding open for it, don't make
  // the table sit out the rest of the long window — deal soon.
  if (state.phase === 'hand-over' && state.nextHandAt !== null) {
    if (chippedPlayers(state).length >= 2) {
      state.nextHandAt = Math.min(state.nextHandAt, ctx.now + HAND_OVER_MS.showdown);
    }
  }
  return succeed(m);
}

// ---------------------------------------------------------------------------
// Hand lifecycle
// ---------------------------------------------------------------------------

function startHand(m: Mutable): void {
  const { state, ctx } = m;
  const prev = state.hand
    ? { buttonSeat: state.hand.buttonSeat, sbSeat: state.hand.sbSeat, bbSeat: state.hand.bbSeat }
    : null;

  const chipped = Object.values(state.players).filter((p) => isEligible(p));
  if (chipped.length < 2) {
    endGame(m, chipped[0]?.id ?? null);
    return;
  }

  const positions = computePositions(state, prev, ctx.randInt);
  if (!positions) {
    endGame(m, null);
    return;
  }

  const deck = shuffle(newDeck(), ctx.randInt);
  const hand: HandState = {
    handNo: (state.hand?.handNo ?? 0) + 1,
    deck,
    deckPos: 0,
    buttonSeat: positions.buttonSeat,
    sbSeat: positions.sbSeat,
    deadSb: positions.deadSb,
    bbSeat: positions.bbSeat,
    holeCards: {},
    board: [],
    inHand: positions.inHand,
    folded: [],
    allIn: [],
    totalCommitted: {},
    round: {
      street: 'preflop',
      currentBet: state.config.bigBlind,
      lastFullRaiseSize: state.config.bigBlind,
      lastFullRaiseTo: state.config.bigBlind,
      committed: {},
      actedSinceFullRaise: [],
      lastAggressor: null,
      toAct: null,
      actionDeadline: null,
      timeBankArmed: false,
      botActAt: null,
    },
    result: null,
  };

  for (const id of positions.inHand) {
    hand.holeCards[id] = [hand.deck[hand.deckPos++], hand.deck[hand.deckPos++]];
    state.players[id].hasPlayed = true;
  }

  state.hand = hand;
  state.phase = 'playing';
  state.nextHandAt = null;
  state.prevBbSeat = positions.bbSeat;

  emit(m, 'hand-started', {
    handNo: hand.handNo,
    buttonSeat: hand.buttonSeat,
    sbSeat: hand.deadSb ? null : hand.sbSeat,
    bbSeat: hand.bbSeat,
    inHand: hand.inHand,
  });

  if (!hand.deadSb) postBlind(m, state.seats[hand.sbSeat]!, state.config.smallBlind, 'small');
  postBlind(m, state.seats[hand.bbSeat]!, state.config.bigBlind, 'big');

  hand.round.toAct = firstToAct(state, hand);
  advance(m);
}

function postBlind(m: Mutable, playerId: string, amount: number, kind: 'small' | 'big'): void {
  const { state } = m;
  const hand = state.hand!;
  const player = state.players[playerId];
  const chips = Math.min(amount, player.stack);
  player.stack -= chips;
  hand.round.committed[playerId] = chips;
  hand.totalCommitted[playerId] = chips;
  if (player.stack === 0) hand.allIn.push(playerId);
  emit(m, 'blind-posted', { playerId, amount: chips, kind });
}

/**
 * Drive the hand forward after any mutation: stamp the next turn, advance
 * streets when the round closes, run out the board when betting is over,
 * and resolve fold-wins/showdowns.
 */
function advance(m: Mutable): void {
  const { state } = m;
  const hand = state.hand;
  if (!hand || state.phase !== 'playing') return;

  // Everyone else folded — instant win, no reveal.
  if (active(hand).length === 1) {
    finishHand(m, resolveFoldWin(hand), 'foldWin');
    return;
  }

  // Someone still owes a decision this round. Only stamp a fresh deadline if
  // the turn is new (null deadline) — advancing for unrelated reasons (e.g. a
  // bystander was kicked) must not reset the acting player's clock.
  if (hand.round.toAct !== null) {
    if (hand.round.actionDeadline === null) stampTurn(m);
    return;
  }

  // Round complete. Betting over entirely (<=1 player can still act)?
  if (actors(hand).length <= 1 && hand.board.length < 5) {
    runOutBoard(m);
    finishHand(m, resolveShowdown(hand), 'showdown');
    return;
  }

  if (hand.round.street === 'river') {
    finishHand(m, resolveShowdown(hand), 'showdown');
    return;
  }

  openNextStreet(m);
}

function runOutBoard(m: Mutable): void {
  const hand = m.state.hand!;
  while (hand.board.length < 5) dealStreet(m);
}

function openNextStreet(m: Mutable): void {
  const { state } = m;
  const hand = state.hand!;
  dealStreet(m);
  hand.round = {
    street: hand.board.length === 3 ? 'flop' : hand.board.length === 4 ? 'turn' : 'river',
    currentBet: 0,
    lastFullRaiseSize: state.config.bigBlind,
    lastFullRaiseTo: 0,
    committed: {},
    actedSinceFullRaise: [],
    // Reset per street: river checked around => first-left-of-button shows first.
    // (All-in runouts never reach here, so the last betting street's aggressor
    // correctly drives showdown order in that case.)
    lastAggressor: null,
    toAct: null,
    actionDeadline: null,
    timeBankArmed: false,
    botActAt: null,
  };
  hand.round.toAct = firstToAct(state, hand);
  advance(m); // recurse: stamps turn, or advances again if nobody can act
}

function dealStreet(m: Mutable): void {
  const hand = m.state.hand!;
  const count = hand.board.length === 0 ? 3 : 1;
  const cards = hand.deck.slice(hand.deckPos, hand.deckPos + count);
  hand.deckPos += count;
  hand.board.push(...cards);
  const street = hand.board.length === 3 ? 'flop' : hand.board.length === 4 ? 'turn' : 'river';
  emit(m, 'street-dealt', { street, cards, board: [...hand.board] });
}

function stampTurn(m: Mutable): void {
  const { state, ctx } = m;
  const hand = state.hand!;
  const round = hand.round;
  const player = state.players[round.toAct!];
  round.timeBankArmed = false;
  if (player.isBot) {
    round.botActAt = ctx.now + BOT_DELAY_BASE_MS + ctx.randInt(BOT_DELAY_JITTER_MS);
    round.actionDeadline = round.botActAt + 10_000; // fallback if bot logic ever fails
  } else if (player.status === 'away') {
    round.botActAt = null;
    round.actionDeadline = ctx.now; // sweep resolves instantly
    round.timeBankArmed = true;
  } else {
    round.botActAt = null;
    round.actionDeadline = ctx.now + state.config.actionTimeMs;
  }
  emit(m, 'turn', {
    playerId: round.toAct,
    street: round.street,
    deadline: round.actionDeadline,
  });
}

function finishHand(
  m: Mutable,
  resolution: ReturnType<typeof resolveShowdown>,
  kind: 'foldWin' | 'showdown'
): void {
  const { state } = m;
  const hand = state.hand!;
  hand.result = resolution.result;
  hand.round.toAct = null;
  hand.round.actionDeadline = null;
  hand.round.botActAt = null;

  for (const [id, amount] of Object.entries(resolution.payouts)) {
    state.players[id].stack += amount;
  }
  emit(m, 'hand-result', {
    handNo: hand.handNo,
    kind,
    pots: resolution.result.pots,
    revealed: resolution.result.revealed,
    hands: resolution.result.hands,
    showdownOrder: resolution.result.showdownOrder,
    descriptions: resolution.result.descriptions,
    refunds: resolution.result.refunds,
    payouts: resolution.payouts,
    board: [...hand.board],
  });

  markBusts(m);

  // A bot table folds up the moment its last human busts with no rebuy left —
  // nobody wants to watch the bots finish the night without them.
  if (humansAreDone(state)) {
    endGame(m, chipLeader(state)?.id ?? null, 'humansOut');
    return;
  }

  // 'holding' returns too: the extended rebuy deadline must not be overwritten
  // by the normal between-hands delay below (and the hold outranks a pending
  // pause — pauseAfterHand stays set for the next completed hand).
  if (settleOrHold(m) !== 'normal') return;

  parkAfterHand(m, kind);
}

function markBusts(m: Mutable): void {
  const { state, ctx } = m;
  for (const player of Object.values(state.players)) {
    if (player.seat !== null && player.stack === 0 && player.status !== 'busted') {
      player.status = 'busted';
      emit(m, 'player-busted', { playerId: player.id });
      // Busted bots rebuy on their own after a "think" delay (sweep-driven).
      if (player.isBot && topUpAmount(state.config, player.topUpsUsed ?? 0) > 0) {
        player.topUpAt = ctx.now + BOT_DELAY_BASE_MS + ctx.randInt(BOT_DELAY_JITTER_MS);
      }
    }
  }
}

function chipLeader(state: GameState): Player | undefined {
  return chippedPlayers(state).sort((a, b) => b.stack - a.stack)[0];
}

function parkAfterHand(m: Mutable, kind: 'foldWin' | 'showdown'): void {
  const { state, ctx } = m;
  if (state.pauseAfterHand) {
    state.pauseAfterHand = false;
    state.phase = 'paused';
    state.nextHandAt = null;
    emit(m, 'paused', {});
    return;
  }
  state.phase = 'hand-over';
  state.nextHandAt = ctx.now + HAND_OVER_MS[kind];
}

/** Seated, chipped, still-present players — the ones who could play a hand. */
function chippedPlayers(state: GameState): Player[] {
  return Object.values(state.players).filter(
    (p) => p.seat !== null && p.stack > 0 && p.status !== 'kicked' && p.status !== 'left'
  );
}

/**
 * True when bots are seated but no human can play another hand: every human
 * is busted (or gone) with no top-up left. A human who can still rebuy keeps
 * the table open — the normal hold-window/next-hand flow covers them.
 */
function humansAreDone(state: GameState): boolean {
  const botsSeated = Object.values(state.players).some((p) => p.isBot && p.seat !== null);
  if (!botsSeated) return false;
  return (
    !chippedPlayers(state).some((p) => !p.isBot) &&
    !eligibleRebuyers(state).some((p) => !p.isBot)
  );
}

/** Seated busted players whose next top-up is still available. */
function eligibleRebuyers(state: GameState): Player[] {
  return Object.values(state.players).filter(
    (p) =>
      p.seat !== null &&
      p.status === 'busted' &&
      topUpAmount(state.config, p.topUpsUsed ?? 0) > 0
  );
}

/**
 * End the game if it truly can't continue, or hold the table open when a
 * top-up could still save it. When a bust (or leave) drops the table below
 * two chipped players but rebuys remain, we park in 'hand-over' with an
 * extended deadline instead of ending; the expired window settles naturally
 * via nextHand -> startHand's "<2 eligible" endGame.
 */
function settleOrHold(m: Mutable): 'ended' | 'holding' | 'normal' {
  const { state, ctx } = m;
  const chipped = chippedPlayers(state);
  if (chipped.length >= 2) return 'normal';
  const rebuyers = eligibleRebuyers(state);
  if (chipped.length + rebuyers.length >= 2) {
    state.phase = 'hand-over';
    state.nextHandAt = Math.max(state.nextHandAt ?? 0, ctx.now + TOP_UP_WINDOW_MS);
    emit(m, 'top-up-window', {
      until: state.nextHandAt,
      playerIds: rebuyers.map((p) => p.id),
    });
    return 'holding';
  }
  endGame(m, chipped[0]?.id ?? null);
  return 'ended';
}

function endGame(
  m: Mutable,
  winnerId: string | null,
  reason: 'host' | 'lastPlayer' | 'humansOut' = 'lastPlayer'
): void {
  m.state.phase = 'ended';
  m.state.nextHandAt = null;
  m.state.endedReason = reason;
  emit(m, 'game-ended', { winnerId, reason });
}

/** Remove a player (kick/leave/bot-yield): fold them out of a live hand, free the seat. */
function removePlayer(m: Mutable, playerId: string, status: 'kicked' | 'left'): void {
  const { state } = m;
  const player = state.players[playerId];

  state.seatRequests = state.seatRequests.filter((r) => r.playerId !== playerId);
  foldOutOfLiveHand(m, playerId);

  if (player.seat !== null) {
    state.seats[player.seat] = null;
    player.seat = null;
  }
  player.status = status;
  player.topUpAt = null;
  emit(m, 'player-removed', { playerId, status });

  if (state.phase === 'playing') advance(m);
  else if (state.phase === 'hand-over') {
    // Same gate as finishHand: the last chipped opponent leaving shouldn't end
    // the game while a busted player could still rebuy — and a rebuyer leaving
    // mid-window should settle it for the winner immediately.
    settleOrHold(m);
  }
}

function foldOutOfLiveHand(m: Mutable, playerId: string): void {
  const { state } = m;
  const hand = state.hand;
  if (
    state.phase !== 'playing' ||
    !hand ||
    !hand.inHand.includes(playerId) ||
    hand.folded.includes(playerId)
  ) {
    return;
  }
  hand.folded.push(playerId);
  emit(m, 'action', {
    playerId,
    move: 'fold',
    amount: 0,
    street: hand.round.street,
    auto: true,
  });
  if (hand.round.toAct === playerId) {
    hand.round.toAct = nextToAct(hand, playerId);
    hand.round.actionDeadline = null;
    hand.round.botActAt = null;
  }
}
