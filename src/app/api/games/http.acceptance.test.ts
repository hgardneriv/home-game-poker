import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryKV } from '@/server/kv';
import { setLimiterForTests } from '@/server/ratelimit';
import { POST as createGame } from './route';
import { POST as joinGame } from './[id]/join/route';
import { POST as seatOp } from './[id]/seats/route';
import { POST as hostOp } from './[id]/host/route';
import { POST as playerAction } from './[id]/action/route';
import { GET as getState } from './[id]/state/route';
import { GET as getStream } from './[id]/stream/route';
import { POST as rigTable } from './[id]/rig/route';
import { POST as registerPush, DELETE as deletePush, GET as getPush } from './[id]/push/route';
import {
  createMemoryPushKV,
  getDeviceToken,
  isPlayerForeground,
  markPlayerForeground,
  setPushKVForTests,
} from '@/server/push-store';

/**
 * Black-box HTTP acceptance: call the exported route handlers with Request
 * objects. Assert status, cookies, and redacted JSON only — never the deck
 * or another player's hole cards.
 */

type RouteCtx = { params: Promise<{ id: string }> };

function ctx(id: string): RouteCtx {
  return { params: Promise.resolve({ id }) };
}

function cookieFrom(res: Response): string | null {
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  return raw.split(';')[0] ?? null;
}

function jsonReq(
  url: string,
  body: unknown,
  cookie?: string | null,
  extra?: HeadersInit
): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  if (extra) Object.assign(headers, extra);
  return new Request(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function getReq(url: string, cookie?: string | null, extra?: HeadersInit): Request {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (extra) Object.assign(headers, extra);
  return new Request(url, { method: 'GET', headers });
}

function assertRedacted(payload: unknown) {
  const text = JSON.stringify(payload);
  expect(text).not.toContain('"deck"');
  expect(text).not.toContain('"holeCards"');
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function create(body: unknown) {
  const res = await createGame(jsonReq('http://localhost/api/games', body));
  const data = await readJson(res);
  const cookie = cookieFrom(res);
  return { res, data, cookie, gameId: data.gameId as string | undefined };
}

async function stateOf(gameId: string, cookie?: string | null) {
  const res = await getState(getReq(`http://localhost/api/games/${gameId}/state`, cookie), ctx(gameId));
  const data = await readJson(res);
  return { res, data, state: data.state as Record<string, unknown> | undefined };
}

beforeEach(() => {
  globalThis.__gameKV = new MemoryKV();
  setPushKVForTests(createMemoryPushKV());
});

afterEach(() => {
  globalThis.__gameKV = undefined;
  setPushKVForTests(undefined);
  setLimiterForTests(undefined);
  vi.unstubAllEnvs();
});

describe('rate limits', () => {
  it('returns 429 JSON when the limiter denies create / join / stream / mutate', async () => {
    setLimiterForTests({ limit: async () => ({ success: false }) });

    const created = await create({ name: 'Ada' });
    expect(created.res.status).toBe(429);
    expect(created.data).toMatchObject({ error: { code: 'rate-limited' } });

    setLimiterForTests(undefined);
    const ok = await create({ name: 'Ada' });
    expect(ok.res.status).toBe(200);
    const { gameId, cookie } = ok;

    setLimiterForTests({ limit: async () => ({ success: false }) });
    const join = await joinGame(
      jsonReq(`http://localhost/api/games/${gameId}/join`, { name: 'Pat', seat: 1 }),
      ctx(gameId!)
    );
    expect(join.status).toBe(429);

    const stream = await getStream(getReq(`http://localhost/api/games/${gameId}/stream`), ctx(gameId!));
    expect(stream.status).toBe(429);
    expect(await stream.json()).toMatchObject({ error: { code: 'rate-limited' } });

    const act = await playerAction(
      jsonReq(`http://localhost/api/games/${gameId}/action`, { move: 'fold' }, cookie),
      ctx(gameId!)
    );
    expect(act.status).toBe(429);
  });
});

describe('POST /api/games', () => {
  it('rejects a missing name', async () => {
    const { res, data } = await create({ name: '   ' });
    expect(res.status).toBe(400);
    expect(data).toMatchObject({ error: { code: 'bad-request' } });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('quick play mints a host cookie, auto-starts vs 5 bots, and forces topUps 0', async () => {
    const { res, cookie, gameId } = await create({
      name: 'Ada',
      quickPlay: true,
      config: { topUps: 9 },
    });
    expect(res.status).toBe(200);
    expect(gameId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(cookie).toMatch(new RegExp(`^hg_${gameId}=`));

    const { state } = await stateOf(gameId!, cookie);
    expect(state).toBeDefined();
    assertRedacted(state);
    expect(state!.phase).toBe('playing');
    expect(state!.hosted).toBe(false);
    expect((state!.config as { topUps: number }).topUps).toBe(0);
    const players = Object.values(state!.players as Record<string, { isBot: boolean }>);
    expect(players.filter((p) => p.isBot)).toHaveLength(5);
    expect(state!.yourId).toBeTruthy();
    expect(state!.hand).toBeTruthy();
  });

  it('hosted create stays in lobby with the requested stack/blinds/bots', async () => {
    const { res, cookie, gameId } = await create({
      name: 'Host',
      bots: 2,
      config: { startingStack: 40, smallBlind: 2, bigBlind: 4, topUps: 3 },
    });
    expect(res.status).toBe(200);
    const { state } = await stateOf(gameId!, cookie);
    expect(state!.phase).toBe('lobby');
    expect(state!.hosted).toBe(true);
    expect(state!.config).toMatchObject({
      startingStack: 40,
      smallBlind: 2,
      bigBlind: 4,
      topUps: 3,
    });
    const bots = Object.values(state!.players as Record<string, { isBot: boolean }>).filter((p) => p.isBot);
    expect(bots).toHaveLength(2);
    expect(state!.hand).toBeNull();
  });
});

describe('GET /api/games/:id/state', () => {
  it('404s an unknown game', async () => {
    const { res, data } = await stateOf('missing');
    expect(res.status).toBe(404);
    expect(data).toMatchObject({ error: { code: 'not-found' } });
  });

  it('anonymous snapshot has null yourId; host cookie sees yourId', async () => {
    const { cookie, gameId } = await create({ name: 'Host' });
    const anon = await stateOf(gameId!);
    expect(anon.res.status).toBe(200);
    assertRedacted(anon.state);
    expect(anon.state!.yourId).toBeNull();

    const host = await stateOf(gameId!, cookie);
    expect(host.state!.yourId).toBeTruthy();
    expect(host.state!.yourId).toBe(host.state!.hostId);
  });
});

describe('POST /api/games/:id/join', () => {
  it('400s an empty name and 404s an unknown game', async () => {
    const { gameId } = await create({ name: 'Host' });
    const empty = await joinGame(jsonReq(`http://localhost/api/games/${gameId}/join`, { name: '' }), ctx(gameId!));
    expect(empty.status).toBe(400);

    const missing = await joinGame(jsonReq('http://localhost/api/games/nope/join', { name: 'Pat' }), ctx('nope'));
    expect(missing.status).toBe(404);
  });

  it('mints a guest cookie and a seat request; the same cookie is a read, not a second player', async () => {
    const { cookie: hostCookie, gameId } = await create({ name: 'Host' });
    const joinRes = await joinGame(
      jsonReq(`http://localhost/api/games/${gameId}/join`, { name: 'Pat', seat: 1 }),
      ctx(gameId!)
    );
    expect(joinRes.status).toBe(200);
    const guestCookie = cookieFrom(joinRes);
    expect(guestCookie).toMatch(new RegExp(`^hg_${gameId}=`));
    const joined = await readJson(joinRes);
    assertRedacted(joined.state);
    const guestState = joined.state as { yourId: string; seatRequests: { playerId: string }[] };
    expect(guestState.yourId).toBeTruthy();
    expect(guestState.seatRequests.some((r) => r.playerId === guestState.yourId)).toBe(true);

    const again = await joinGame(
      jsonReq(`http://localhost/api/games/${gameId}/join`, { name: 'Pat Two', seat: 2 }, guestCookie),
      ctx(gameId!)
    );
    expect(again.status).toBe(200);
    expect(cookieFrom(again)).toBeNull();
    const againState = (await readJson(again)).state as { yourId: string };
    expect(againState.yourId).toBe(guestState.yourId);

    const hostView = await stateOf(gameId!, hostCookie);
    const names = Object.values(hostView.state!.players as Record<string, { name: string }>).map((p) => p.name);
    expect(names.filter((n) => n.startsWith('Pat'))).toEqual(['Pat']);
  });
});

describe('POST /api/games/:id/seats', () => {
  async function pendingGuest() {
    const created = await create({ name: 'Host' });
    const joinRes = await joinGame(
      jsonReq(`http://localhost/api/games/${created.gameId}/join`, { name: 'Pat', seat: 1 }),
      ctx(created.gameId!)
    );
    const guest = (await readJson(joinRes)).state as { yourId: string };
    return { ...created, guestCookie: cookieFrom(joinRes), guestId: guest.yourId };
  }

  it('401s without a cookie and 400s a bad op', async () => {
    const { gameId, cookie, guestId } = await pendingGuest();
    const noAuth = await seatOp(
      jsonReq(`http://localhost/api/games/${gameId}/seats`, { op: 'approve', playerId: guestId }),
      ctx(gameId!)
    );
    expect(noAuth.status).toBe(401);

    const bad = await seatOp(
      jsonReq(`http://localhost/api/games/${gameId}/seats`, { op: 'maybe', playerId: guestId }, cookie),
      ctx(gameId!)
    );
    expect(bad.status).toBe(400);
  });

  it('host approve seats the guest; host deny rejects the request', async () => {
    const approved = await pendingGuest();
    const ok = await seatOp(
      jsonReq(
        `http://localhost/api/games/${approved.gameId}/seats`,
        { op: 'approve', playerId: approved.guestId },
        approved.cookie
      ),
      ctx(approved.gameId!)
    );
    expect(ok.status).toBe(200);
    const seated = (await readJson(ok)).state as {
      players: Record<string, { seat: number | null }>;
      seatRequests: unknown[];
    };
    assertRedacted(seated);
    expect(seated.players[approved.guestId].seat).toBeTypeOf('number');
    expect(seated.seatRequests).toEqual([]);

    const denied = await pendingGuest();
    const deny = await seatOp(
      jsonReq(
        `http://localhost/api/games/${denied.gameId}/seats`,
        { op: 'deny', playerId: denied.guestId },
        denied.cookie
      ),
      ctx(denied.gameId!)
    );
    expect(deny.status).toBe(200);
    const afterDeny = (await readJson(deny)).state as {
      players: Record<string, { seat: number | null; status: string }>;
      seatRequests: { playerId: string }[];
    };
    expect(afterDeny.seatRequests.some((r) => r.playerId === denied.guestId)).toBe(false);
    expect(afterDeny.players[denied.guestId]?.seat ?? null).toBeNull();
  });

  it('a guest cannot approve their own seat request', async () => {
    const { gameId, guestCookie, guestId } = await pendingGuest();
    const res = await seatOp(
      jsonReq(`http://localhost/api/games/${gameId}/seats`, { op: 'approve', playerId: guestId }, guestCookie),
      ctx(gameId!)
    );
    expect(res.status).toBe(403);
  });
});

describe('POST /api/games/:id/host', () => {
  it('401s without a cookie and 400s a bad op', async () => {
    const { gameId, cookie } = await create({ name: 'Host' });
    expect(
      (await hostOp(jsonReq(`http://localhost/api/games/${gameId}/host`, { op: 'start' }), ctx(gameId!))).status
    ).toBe(401);
    expect(
      (await hostOp(jsonReq(`http://localhost/api/games/${gameId}/host`, { op: 'explode' }, cookie), ctx(gameId!)))
        .status
    ).toBe(400);
  });

  it('start / pause / resume / addBot / kick / endGame / showResults as the host', async () => {
    const { cookie, gameId } = await create({ name: 'Host', bots: 1 });
    const start = await hostOp(
      jsonReq(`http://localhost/api/games/${gameId}/host`, { op: 'start' }, cookie),
      ctx(gameId!)
    );
    expect(start.status).toBe(200);
    const started = (await readJson(start)).state as { phase: string };
    expect(started.phase).toBe('playing');

    const pause = await hostOp(
      jsonReq(`http://localhost/api/games/${gameId}/host`, { op: 'pause' }, cookie),
      ctx(gameId!)
    );
    expect(pause.status).toBe(200);
    expect(((await readJson(pause)).state as { pauseAfterHand: boolean }).pauseAfterHand).toBe(true);

    // Resume is only legal once the table has actually entered `paused`
    // (after the current hand). Mid-hand it is a 400.
    const resumeEarly = await hostOp(
      jsonReq(`http://localhost/api/games/${gameId}/host`, { op: 'resume' }, cookie),
      ctx(gameId!)
    );
    expect(resumeEarly.status).toBe(400);

    const add = await hostOp(
      jsonReq(`http://localhost/api/games/${gameId}/host`, { op: 'addBot' }, cookie),
      ctx(gameId!)
    );
    expect(add.status).toBe(200);
    const afterAdd = (await readJson(add)).state as { players: Record<string, { isBot: boolean; id: string }> };
    const botIds = Object.values(afterAdd.players).filter((p) => p.isBot).map((p) => p.id);
    expect(botIds.length).toBeGreaterThanOrEqual(2);

    const joinRes = await joinGame(
      jsonReq(`http://localhost/api/games/${gameId}/join`, { name: 'Pat', seat: 3 }),
      ctx(gameId!)
    );
    const guestId = ((await readJson(joinRes)).state as { yourId: string }).yourId;
    await seatOp(
      jsonReq(`http://localhost/api/games/${gameId}/seats`, { op: 'approve', playerId: guestId }, cookie),
      ctx(gameId!)
    );
    const kick = await hostOp(
      jsonReq(`http://localhost/api/games/${gameId}/host`, { op: 'kick', playerId: guestId }, cookie),
      ctx(gameId!)
    );
    expect(kick.status).toBe(200);
    const kicked = (await readJson(kick)).state as { players: Record<string, { status: string }> };
    expect(kicked.players[guestId].status).toBe('kicked');

    const end = await hostOp(
      jsonReq(`http://localhost/api/games/${gameId}/host`, { op: 'endGame' }, cookie),
      ctx(gameId!)
    );
    expect(end.status).toBe(200);
    const ended = (await readJson(end)).state as { phase: string; endedReason: string | null };
    expect(ended.phase).toBe('ended');
    expect(ended.endedReason).toBe('host');

    // Mid-session end refunds the pot and drops the unfinished hand, so
    // there is no last-hand review — showResults is a 400.
    const results = await hostOp(
      jsonReq(`http://localhost/api/games/${gameId}/host`, { op: 'showResults' }, cookie),
      ctx(gameId!)
    );
    expect(results.status).toBe(400);
  });
});

describe('POST /api/games/:id/action', () => {
  it('401s without a cookie and 400s an unknown move', async () => {
    const { cookie, gameId } = await create({ name: 'Host', bots: 1 });
    await hostOp(jsonReq(`http://localhost/api/games/${gameId}/host`, { op: 'start' }, cookie), ctx(gameId!));
    expect(
      (await playerAction(jsonReq(`http://localhost/api/games/${gameId}/action`, { move: 'fold' }), ctx(gameId!)))
        .status
    ).toBe(401);
    expect(
      (
        await playerAction(
          jsonReq(`http://localhost/api/games/${gameId}/action`, { move: 'allin' }, cookie),
          ctx(gameId!)
        )
      ).status
    ).toBe(400);
  });

  it('the to-act player can take a legal fold or check; a stale expectedCall is 409', async () => {
    const { cookie, gameId } = await create({ name: 'Host', bots: 1 });
    await hostOp(jsonReq(`http://localhost/api/games/${gameId}/host`, { op: 'start' }, cookie), ctx(gameId!));
    const { state } = await stateOf(gameId!, cookie);
    const hand = state!.hand as {
      toAct: string;
      legalActions: { canCheck: boolean; callAmount: number } | null;
    } | null;
    const yourId = state!.yourId as string;

    if (hand && hand.toAct === yourId && hand.legalActions) {
      if (!hand.legalActions.canCheck) {
        const stale = await playerAction(
          jsonReq(
            `http://localhost/api/games/${gameId}/action`,
            { move: 'call', expectedCall: hand.legalActions.callAmount + 99 },
            cookie
          ),
          ctx(gameId!)
        );
        expect(stale.status).toBe(409);
        const err = await readJson(stale);
        expect(err).toMatchObject({ error: { code: 'stale-action' } });
      }
      const move = hand.legalActions.canCheck ? 'check' : 'fold';
      const act = await playerAction(
        jsonReq(`http://localhost/api/games/${gameId}/action`, { move }, cookie),
        ctx(gameId!)
      );
      expect(act.status).toBe(200);
      assertRedacted((await readJson(act)).state);
    } else {
      // Host is not first to act (common heads-up). Folding out of turn is 409.
      const notTurn = await playerAction(
        jsonReq(`http://localhost/api/games/${gameId}/action`, { move: 'fold' }, cookie),
        ctx(gameId!)
      );
      expect(notTurn.status).toBe(409);
    }
  });

  it('leave marks the guest left; playAgain on a hosted ended table returns to lobby', async () => {
    const { cookie, gameId } = await create({ name: 'Host' });
    const joinRes = await joinGame(
      jsonReq(`http://localhost/api/games/${gameId}/join`, { name: 'Pat', seat: 1 }),
      ctx(gameId!)
    );
    const guestCookie = cookieFrom(joinRes);
    const guestId = ((await readJson(joinRes)).state as { yourId: string }).yourId;
    await seatOp(
      jsonReq(`http://localhost/api/games/${gameId}/seats`, { op: 'approve', playerId: guestId }, cookie),
      ctx(gameId!)
    );

    const left = await playerAction(
      jsonReq(`http://localhost/api/games/${gameId}/action`, { move: 'leave' }, guestCookie),
      ctx(gameId!)
    );
    expect(left.status).toBe(200);
    const leftState = (await readJson(left)).state as { players: Record<string, { status: string }> };
    expect(leftState.players[guestId].status).toBe('left');

    const end = await hostOp(
      jsonReq(`http://localhost/api/games/${gameId}/host`, { op: 'endGame' }, cookie),
      ctx(gameId!)
    );
    expect(end.status).toBe(200);
    await hostOp(
      jsonReq(`http://localhost/api/games/${gameId}/host`, { op: 'showResults' }, cookie),
      ctx(gameId!)
    );

    const again = await playerAction(
      jsonReq(`http://localhost/api/games/${gameId}/action`, { move: 'playAgain' }, cookie),
      ctx(gameId!)
    );
    expect(again.status).toBe(200);
    const lobby = (await readJson(again)).state as { phase: string };
    expect(lobby.phase).toBe('lobby');
  });
});

describe('GET /api/games/:id/stream', () => {
  it('404s an unknown game', async () => {
    const res = await getStream(getReq('http://localhost/api/games/missing/stream'), ctx('missing'));
    expect(res.status).toBe(404);
  });

  it('first SSE frame is redacted JSON tagged with the version; anonymous yourId is null', async () => {
    const { cookie, gameId } = await create({ name: 'Host', quickPlay: true });
    const ac = new AbortController();
    const res = await getStream(
      getReq(`http://localhost/api/games/${gameId}/stream`, cookie, undefined),
      ctx(gameId!)
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);

    const reader = res.body!.getReader();
    const chunks: string[] = [];
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !chunks.join('').includes('data:')) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }
    ac.abort();
    await reader.cancel();

    const text = chunks.join('');
    expect(text).toMatch(/^id: \d+/m);
    const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
    expect(dataLine).toBeTruthy();
    const payload = JSON.parse(dataLine!.slice(6)) as { state: Record<string, unknown> };
    assertRedacted(payload);
    expect(payload.state.yourId).toBeTruthy();
    expect(payload.state.id).toBe(gameId);
    expect(await isPlayerForeground(gameId!, payload.state.yourId as string)).toBe(true);

    const anonAc = new AbortController();
    const anon = await getStream(
      new Request(`http://localhost/api/games/${gameId}/stream`, { signal: anonAc.signal }),
      ctx(gameId!)
    );
    const anonReader = anon.body!.getReader();
    const anonChunks: string[] = [];
    const anonDeadline = Date.now() + 3000;
    while (Date.now() < anonDeadline && !anonChunks.join('').includes('data:')) {
      const { value, done } = await anonReader.read();
      if (done) break;
      anonChunks.push(new TextDecoder().decode(value));
    }
    anonAc.abort();
    await anonReader.cancel();
    const anonLine = anonChunks.join('').split('\n').find((l) => l.startsWith('data: '));
    const anonPayload = JSON.parse(anonLine!.slice(6)) as { state: { yourId: string | null } };
    expect(anonPayload.state.yourId).toBeNull();
  });

  it('after a tick, the stream still only pushes redacted frames', async () => {
    const { cookie, gameId } = await create({ name: 'Host' });
    const res = await getStream(getReq(`http://localhost/api/games/${gameId}/stream`, cookie), ctx(gameId!));
    const reader = res.body!.getReader();
    const chunks: string[] = [];
    const stop = setTimeout(() => void reader.cancel(), 1200);
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(new TextDecoder().decode(value));
      }
    } catch {
      // cancel() rejects the pending read — expected
    } finally {
      clearTimeout(stop);
    }
    const text = chunks.join('');
    expect(text).toMatch(/data: /);
    for (const line of text.split('\n').filter((l) => l.startsWith('data: '))) {
      assertRedacted(JSON.parse(line.slice(6)));
    }
  }, 10_000);
});

describe('POST /api/games/:id/push', () => {
  const token = 'ab'.repeat(32);

  it('401s without the seat cookie and never stores a token', async () => {
    const { gameId } = await create({ name: 'Ada', quickPlay: true });
    const res = await registerPush(
      jsonReq(`http://localhost/api/games/${gameId}/push`, { token }),
      ctx(gameId!)
    );
    expect(res.status).toBe(401);
    expect(await getDeviceToken(gameId!, 'anyone')).toBeNull();
  });

  it('rejects a non-hex token', async () => {
    const { cookie, gameId } = await create({ name: 'Ada', quickPlay: true });
    const res = await registerPush(
      jsonReq(`http://localhost/api/games/${gameId}/push`, { token: 'not-a-token' }, cookie),
      ctx(gameId!)
    );
    expect(res.status).toBe(400);
  });

  it('stores the token against the cookie identity and DELETE removes it', async () => {
    const { cookie, gameId } = await create({ name: 'Ada', quickPlay: true });
    const { state } = await stateOf(gameId!, cookie);
    const playerId = state!.yourId as string;

    const res = await registerPush(
      jsonReq(`http://localhost/api/games/${gameId}/push`, { token }, cookie),
      ctx(gameId!)
    );
    expect(res.status).toBe(200);
    expect(await getDeviceToken(gameId!, playerId)).toBe(token);

    const del = await deletePush(
      new Request(`http://localhost/api/games/${gameId}/push`, {
        method: 'DELETE',
        headers: { cookie: cookie! },
      }),
      ctx(gameId!)
    );
    expect(del.status).toBe(200);
    expect(await getDeviceToken(gameId!, playerId)).toBeNull();
  });

  it('DELETE 401s without the seat cookie', async () => {
    const { gameId } = await create({ name: 'Ada', quickPlay: true });
    const del = await deletePush(
      new Request(`http://localhost/api/games/${gameId}/push`, { method: 'DELETE' }),
      ctx(gameId!)
    );
    expect(del.status).toBe(401);
  });

  it('clears foreground presence when the native app reports background', async () => {
    const { cookie, gameId } = await create({ name: 'Ada', quickPlay: true });
    const { state } = await stateOf(gameId!, cookie);
    const playerId = state!.yourId as string;
    await markPlayerForeground(gameId!, playerId);
    expect(await isPlayerForeground(gameId!, playerId)).toBe(true);
    const res = await registerPush(
      jsonReq(`http://localhost/api/games/${gameId}/push`, { active: false }, cookie),
      ctx(gameId!)
    );
    expect(res.status).toBe(200);
    expect(await isPlayerForeground(gameId!, playerId)).toBe(false);
    const body = (await res.json()) as { attempt: { outcome: string; skip: string } };
    expect(body.attempt.outcome).toBe('skipped');
    expect(['unconfigured', 'not-acting']).toContain(body.attempt.skip);
  });

  it('GET reports token + last attempt without leaking the token', async () => {
    const { cookie, gameId } = await create({ name: 'Ada', quickPlay: true });
    const { state } = await stateOf(gameId!, cookie);
    const playerId = state!.yourId as string;
    await registerPush(
      jsonReq(`http://localhost/api/games/${gameId}/push`, { token }, cookie),
      ctx(gameId!)
    );
    const res = await getPush(getReq(`http://localhost/api/games/${gameId}/push`, cookie), ctx(gameId!));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      ok: true,
      hasToken: true,
      apnsConfigured: false,
      apnsProduction: false,
    });
    expect(JSON.stringify(data)).not.toContain(token);
    expect(playerId).toBeTruthy();
  });

  it('429s when the mutate limiter denies register', async () => {
    const { cookie, gameId } = await create({ name: 'Ada', quickPlay: true });
    setLimiterForTests({ limit: async () => ({ success: false }) });
    const res = await registerPush(
      jsonReq(`http://localhost/api/games/${gameId}/push`, { token }, cookie),
      ctx(gameId!)
    );
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: { code: 'rate-limited' } });
  });
});

describe('POST /api/games/:id/rig', () => {
  it('404s without ALLOW_TABLE_RIG (the production door)', async () => {
    const { cookie, gameId } = await create({ name: 'Host', quickPlay: true });
    const res = await rigTable(
      jsonReq(`http://localhost/api/games/${gameId}/rig`, { setup: 'pair-twos' }, cookie),
      ctx(gameId!)
    );
    expect(res.status).toBe(404);
  });

  it('404s in production even when the flag is set', async () => {
    const { cookie, gameId } = await create({ name: 'Host', quickPlay: true });
    vi.stubEnv('ALLOW_TABLE_RIG', '1');
    vi.stubEnv('NODE_ENV', 'production');
    const res = await rigTable(
      jsonReq(`http://localhost/api/games/${gameId}/rig`, { setup: 'pair-twos' }, cookie),
      ctx(gameId!)
    );
    expect(res.status).toBe(404);
  });

  it('plants a named demo hand when ALLOW_TABLE_RIG=1 outside production', async () => {
    vi.stubEnv('ALLOW_TABLE_RIG', '1');
    const { cookie, gameId } = await create({ name: 'Host', quickPlay: true });
    const res = await rigTable(
      jsonReq(`http://localhost/api/games/${gameId}/rig`, { setup: 'pair-twos' }, cookie),
      ctx(gameId!)
    );
    expect(res.status).toBe(200);
    const state = (await readJson(res)).state as { hand: { myCards: unknown; street: string } | null };
    assertRedacted(state);
    expect(state.hand?.myCards).toBeTruthy();
    expect(state.hand?.street).toBe('flop');
  });
});
