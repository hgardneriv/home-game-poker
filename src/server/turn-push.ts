import type { GameState, Street } from '@/engine/types';
import { apnsConfigured, sendTurnAlert } from './apns';
import { deleteDeviceToken, getDeviceToken, isPlayerForeground } from './push-store';

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

/**
 * After a persisted mutation: notify the human who just became toAct.
 * No-ops without APNs env, without a registered token, for bots, or when
 * that player's SSE stream is still touching the foreground key.
 */
export async function maybeSendTurnPush(
  before: GameState | null,
  after: GameState
): Promise<void> {
  const playerId = turnJustStarted(before, after);
  if (!playerId) return;
  const player = after.players[playerId];
  if (!player || player.isBot) return;
  if (player.status === 'left' || player.status === 'kicked') return;
  if (!apnsConfigured()) return;
  if (await isPlayerForeground(after.id, playerId)) return;
  const token = await getDeviceToken(after.id, playerId);
  if (!token) return;
  try {
    const result = await sendTurnAlert(token, after.id);
    if (result.invalidate) await deleteDeviceToken(after.id, playerId);
  } catch {
    // APNs blip — the next turn will retry; do not fail the game write.
  }
}
