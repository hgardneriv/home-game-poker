import { getKV } from '@/server/kv';
import { playerIdFromRequest } from '@/server/identity';
import { json, readJson, storeResponse } from '@/server/api';
import { applyDemoHand, isDemoHand } from '@/server/demo-hands';

export const dynamic = 'force-dynamic';

function rigAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_TABLE_RIG === '1';
}

/**
 * Local-dev only. Plants a named README-screenshot hand and freezes timers
 * so the sweep cannot walk the table. 404s in production and without the env.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  if (!rigAllowed()) {
    return json({ error: { code: 'not-found', message: 'Not found' } }, 404);
  }

  const { id: gameId } = await params;
  const playerId = playerIdFromRequest(req, gameId);
  if (!playerId) {
    return json({ error: { code: 'unauthorized', message: 'Not in this game' } }, 401);
  }

  const body = await readJson(req);
  const setup = String(body.setup ?? '');
  if (!isDemoHand(setup)) {
    return json({ error: { code: 'bad-request', message: 'Unknown setup' } }, 400);
  }

  const kv = getKV();
  const entry = await kv.read(gameId);
  if (!entry) return json({ error: { code: 'not-found', message: 'Game not found' } }, 404);
  if (entry.state.hostId !== playerId) {
    return json({ error: { code: 'unauthorized', message: 'Host only' } }, 401);
  }
  if (!entry.state.hand) {
    return json({ error: { code: 'bad-phase', message: 'Start the hand first' } }, 400);
  }

  const state = applyDemoHand(entry.state, setup, Date.now());
  state.version = entry.version + 1;
  const version = await kv.cas(gameId, entry.version, state);
  if (version === 0) {
    return json({ error: { code: 'conflict', message: 'Try again' } }, 409);
  }
  state.version = version;
  return storeResponse({ ok: true, state, version }, playerId);
}
