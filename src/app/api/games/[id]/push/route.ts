import { playerIdFromRequest } from '@/server/identity';
import { json, readJson } from '@/server/api';
import { rateLimited } from '@/server/ratelimit';
import {
  clearPlayerForeground,
  deleteDeviceToken,
  getDeviceToken,
  getLastPush,
  isPlayerForeground,
  markPlayerForeground,
  saveDeviceToken,
} from '@/server/push-store';
import { apnsConfigured, apnsProduction } from '@/server/apns';
import { remindTurnIfActing, sendTurnPushToPlayer } from '@/server/turn-push';
import { getKV } from '@/server/kv';

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
  if (body.active === true) {
    await markPlayerForeground(gameId, playerId);
    return json({ ok: true });
  }
  if (body.active === false) {
    await clearPlayerForeground(gameId, playerId);
    const attempt = await remindTurnIfActing(gameId, playerId);
    return json({ ok: true, attempt });
  }
  if (body.test === true) {
    await clearPlayerForeground(gameId, playerId);
    const entry = await getKV().read(gameId);
    if (!entry) return json({ error: { code: 'not-found', message: 'Game not found' } }, 404);
    const attempt = await sendTurnPushToPlayer(entry.state, playerId, { ignoreForeground: true });
    return json({ ok: true, attempt });
  }

  const token = String(body.token ?? '').trim();
  if (!TOKEN_RE.test(token))
    return json({ error: { code: 'bad-request', message: 'Invalid device token' } }, 400);

  await saveDeviceToken(gameId, playerId, token);
  return json({ ok: true });
}

/** Cookie-auth debug: token stored? APNs env present? last send result? */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: gameId } = await params;
  const playerId = playerIdFromRequest(req, gameId);
  if (!playerId)
    return json({ error: { code: 'unauthorized', message: 'Not in this game' } }, 401);
  const [hasToken, foreground, last] = await Promise.all([
    getDeviceToken(gameId, playerId).then((t) => t !== null),
    isPlayerForeground(gameId, playerId),
    getLastPush(gameId, playerId),
  ]);
  return json({
    ok: true,
    apnsConfigured: apnsConfigured(),
    apnsProduction: apnsProduction(),
    hasToken,
    foreground,
    last,
  });
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
