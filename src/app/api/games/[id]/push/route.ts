import { playerIdFromRequest } from '@/server/identity';
import { json, readJson } from '@/server/api';
import { rateLimited } from '@/server/ratelimit';
import { clearPlayerForeground, deleteDeviceToken, saveDeviceToken } from '@/server/push-store';
import { remindTurnIfActing } from '@/server/turn-push';

export const dynamic = 'force-dynamic';

/** Hex APNs token — typically 64 chars; allow some slack for future formats. */
const TOKEN_RE = /^[0-9a-fA-F]{64,256}$/;

/**
 * Register or drop this player's APNs device token for the game.
 * Identity is the existing seat cookie — the body never carries a playerId.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: gameId } = await params;
  const playerId = playerIdFromRequest(req, gameId);
  if (!playerId)
    return json({ error: { code: 'unauthorized', message: 'Not in this game' } }, 401);
  const blocked = await rateLimited('mutate', playerId);
  if (blocked) return blocked;

  const body = await readJson(req);
  if (body.active === false) {
    await clearPlayerForeground(gameId, playerId);
    await remindTurnIfActing(gameId, playerId);
    return json({ ok: true });
  }

  const token = String(body.token ?? '').trim();
  if (!TOKEN_RE.test(token))
    return json({ error: { code: 'bad-request', message: 'Invalid device token' } }, 400);

  await saveDeviceToken(gameId, playerId, token);
  return json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: gameId } = await params;
  const playerId = playerIdFromRequest(req, gameId);
  if (!playerId)
    return json({ error: { code: 'unauthorized', message: 'Not in this game' } }, 401);
  const blocked = await rateLimited('mutate', playerId);
  if (blocked) return blocked;
  await deleteDeviceToken(gameId, playerId);
  return json({ ok: true });
}
