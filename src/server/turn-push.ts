import type { GameState, Street } from '@/engine/types';
import { apnsConfigured, sendTurnAlert } from './apns';
import {
  deleteDeviceToken,
  getDeviceToken,
  isPlayerForeground,
  saveLastPush,
  type PushAttempt,
} from './push-store';
import { getKV } from './kv';

export interface TurnActor {
  playerId: string;
  handNo: number;
  street: Street;
}

/** Who must act right now, if anyone. Engine field is hand.round.toAct. */
export function turnActor(state: GameState): TurnActor | null {
  if (state.phase !== 'playing' || !state.hand) return null;
  const playerId = state.hand.round.toAct;
  if (!playerId) return null;
  return { playerId, handNo: state.hand.handNo, street: state.hand.round.street };
}

/**
 * Fire once when (hand, street, toAct) changes — a new street with the same
 * player still counts. Same actor on the same street does not.
 */
export function turnJustStarted(before: GameState | null, after: GameState): string | null {
  const next = turnActor(after);
  if (!next) return null;
  const prev = before ? turnActor(before) : null;
  if (
    prev &&
    prev.playerId === next.playerId &&
    prev.handNo === next.handNo &&
    prev.street === next.street
  ) {
    return null;
  }
  return next.playerId;
}

function skipped(skip: NonNullable<PushAttempt['skip']>): PushAttempt {
  return { at: Date.now(), outcome: 'skipped', skip };
}

export async function sendTurnPushToPlayer(
  state: GameState,
  playerId: string,
  opts?: { ignoreForeground?: boolean; via?: PushAttempt['via'] }
): Promise<PushAttempt> {
  const player = state.players[playerId];
  const via = opts?.via;
  const record = async (attempt: PushAttempt) => {
    const tagged = via ? { ...attempt, via } : attempt;
    await saveLastPush(state.id, playerId, tagged);
    return tagged;
  };
  if (!player || player.isBot) return record(skipped('bot'));
  if (player.status === 'left' || player.status === 'kicked') return record(skipped('left'));
  if (!apnsConfigured()) return record(skipped('unconfigured'));
  if (!opts?.ignoreForeground && (await isPlayerForeground(state.id, playerId))) {
    return record(skipped('foreground'));
  }
  const token = await getDeviceToken(state.id, playerId);
  if (!token) return record(skipped('no-token'));
  try {
    const result = await sendTurnAlert(token, state.id);
    if (result.invalidate) await deleteDeviceToken(state.id, playerId);
    return record({
      at: Date.now(),
      outcome: result.status === 200 ? 'sent' : 'error',
      status: result.status,
      reason: result.reason,
    });
  } catch (err) {
    return record({
      at: Date.now(),
      outcome: 'error',
      reason: err instanceof Error ? err.message : 'apns-failed',
    });
  }
}

export async function maybeSendTurnPush(
  before: GameState | null,
  after: GameState
): Promise<void> {
  const playerId = turnJustStarted(before, after);
  if (!playerId) return;
  await sendTurnPushToPlayer(after, playerId, { via: 'turn-start' });
}

/** iPhone backgrounded: if it is already this seat's turn, send now. */
export async function remindTurnIfActing(gameId: string, playerId: string): Promise<PushAttempt> {
  const entry = await getKV().read(gameId);
  if (!entry) return skipped('not-acting');
  const acting = turnActor(entry.state);
  if (!acting || acting.playerId !== playerId) {
    const attempt = { ...skipped('not-acting'), via: 'remind' as const };
    await saveLastPush(gameId, playerId, attempt);
    return attempt;
  }
  return sendTurnPushToPlayer(entry.state, playerId, { ignoreForeground: true, via: 'remind' });
}
