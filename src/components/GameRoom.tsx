'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useGame } from '@/hooks/useGame';
import { JoinScreen } from './JoinScreen';
import { Table } from './Table';
import { ActionBar } from './ActionBar';
import { HostPanel } from './HostPanel';
import { InviteButton } from './InviteButton';
import { HistoryDrawer } from './HistoryDrawer';
import { ToastProvider, useToast } from './Toast';
import { GameOverScreen } from './GameOverScreen';
import type { GameApi } from '@/hooks/useGame';
import { reviewingLastHand } from '@/engine/types';
import { nativeTurnHaptic } from '@/hooks/native';
import { clearLastGameId, writeLastGameId } from '@/hooks/lastGame';

/** Announces table events (players leaving/being kicked) to everyone else. */
function EventNotices({ game }: { game: GameApi }) {
  const toast = useToast();
  const lastSeq = useRef<number | null>(null);
  const state = game.state;
  useEffect(() => {
    if (!state) return;
    const maxSeq = state.events.reduce((a, e) => Math.max(a, e.seq), 0);
    if (lastSeq.current === null) {
      lastSeq.current = maxSeq; // don't replay history on page load
      return;
    }
    for (const event of state.events) {
      if (event.seq <= lastSeq.current) continue;
      const d = event.data as { playerId?: string; status?: string; amount?: number };
      if (!d.playerId || d.playerId === state.yourId) continue;
      const name = state.players[d.playerId]?.name ?? 'A player';
      if (event.type === 'player-removed') {
        toast(
          d.status === 'kicked'
            ? `🚪 ${name} was removed by the host`
            : `👋 ${name} left the game`,
          'info'
        );
      } else if (event.type === 'topped-up') {
        toast(`💰 ${name} topped up $${d.amount}`, 'info');
      }
    }
    lastSeq.current = maxSeq;
  }, [state, toast]);
  return null;
}

/** One shared AudioContext for the whole session. iOS starts contexts
 *  suspended outside a user gesture (so a per-ping context never plays and
 *  never fires onended → it leaks, and iOS caps live contexts). Instead we
 *  create/resume a single context on the first touch and reuse it forever. */
let sharedAudio: AudioContext | null = null;

function unlockAudio() {
  try {
    sharedAudio ??= new AudioContext();
    if (sharedAudio.state === 'suspended') void sharedAudio.resume();
  } catch {
    // no audio available — fine
  }
}

/** Soft ping when action reaches you (PokerNow convention). */
function useTurnPing(isMyTurn: boolean) {
  const wasMyTurn = useRef(false);

  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    return () => window.removeEventListener('pointerdown', unlockAudio);
  }, []);

  useEffect(() => {
    const audio = sharedAudio;
    if (isMyTurn && !wasMyTurn.current) {
      void nativeTurnHaptic();
    }
    if (isMyTurn && !wasMyTurn.current && audio && audio.state === 'running') {
      try {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.08, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.25);
        osc.connect(gain).connect(audio.destination);
        osc.start();
        osc.stop(audio.currentTime + 0.25);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
      } catch {
        // no audio available — fine
      }
    }
    wasMyTurn.current = isMyTurn;
  }, [isMyTurn]);
}

export function GameRoom({ gameId }: { gameId: string }) {
  const game = useGame(gameId);
  const { state, error } = game;
  useTurnPing(
    !!state?.yourId && state.phase === 'playing' && state.hand?.toAct === state.yourId
  );

  // Remember this table so the iPhone app can reopen it after a force-quit.
  // Identity is still the httpOnly cookie; this is only the last URL.
  useEffect(() => {
    if (error) {
      clearLastGameId();
      return;
    }
    if (!state) return;
    const me = state.yourId ? state.players[state.yourId] : null;
    if (state.phase === 'ended' && !reviewingLastHand(state)) {
      clearLastGameId();
      return;
    }
    if (me && (me.status === 'left' || me.status === 'kicked')) {
      clearLastGameId();
      return;
    }
    if (
      me &&
      (me.seat !== null || state.seatRequests.some((r) => r.playerId === me.id))
    ) {
      writeLastGameId(gameId);
    }
  }, [error, state, gameId]);

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div>
          <p className="text-lg font-semibold">😕 {error}</p>
          <Link href="/" className="mt-4 inline-block text-emerald-600 underline">
            Start a new game
          </Link>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="animate-pulse opacity-70">Finding the table…</p>
      </main>
    );
  }

  // Standings wait until the host dismisses the last hand (or there is no
  // last hand — the host ended mid-session and the unfinished pot was refunded).
  if (state.phase === 'ended' && !reviewingLastHand(state)) {
    return <GameOverScreen game={game} />;
  }

  const me = state.yourId ? state.players[state.yourId] : null;

  // Not in the game yet — pick a name and request a seat.
  if (!me) {
    return <JoinScreen game={game} />;
  }

  if (me.status === 'left' || me.status === 'kicked') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="text-5xl">👋</div>
        <p className="text-lg font-semibold">
          {me.status === 'left' ? 'You left the game' : 'The host removed you from the game'}
        </p>
        <p className="text-sm opacity-70">The table plays on without you.</p>
        <Link
          href="/"
          className="mt-2 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white active:scale-95"
        >
          🃏 Play again
        </Link>
      </main>
    );
  }

  // Requested a seat, waiting for the host.
  if (me.seat === null && state.seatRequests.some((r) => r.playerId === me.id)) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-lg font-semibold">Hang tight, {me.name}!</p>
        <p className="opacity-70">Waiting for the host to let you in…</p>
        <span className="mt-2 inline-block h-3 w-3 animate-ping rounded-full bg-emerald-500" />
      </main>
    );
  }

  if (me.seat === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div>
          <p className="text-lg font-semibold">You&apos;re not at this table.</p>
          <Link href="/" className="mt-4 inline-block text-emerald-600 underline">
            Start a new game
          </Link>
        </div>
      </main>
    );
  }

  return (
    <ToastProvider>
      <EventNotices game={game} />
      <LockViewport />
      {/* h-dvh + overflow-hidden: the felt must fit the phone. Any 1px of
          page overflow makes iOS WKWebView expand the layout viewport and
          the table becomes a pannable canvas. */}
      <main className="relative flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden overscroll-none bg-zinc-950">
        <header className="relative z-20 flex min-w-0 shrink-0 items-center justify-between gap-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-2 pl-[max(1rem,env(safe-area-inset-left,0px))] text-sm text-white">
          <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
            <span className="shrink-0 font-semibold">🃏 Home Game</span>
            <span className="truncate text-xs text-white/50">
              ${state.config.smallBlind}/${state.config.bigBlind}
              {state.hand ? ` · hand #${state.hand.handNo}` : ''}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <HistoryDrawer game={game} />
            <InviteButton gameId={gameId} />
          </div>
        </header>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <Table game={game} />
        </div>

        <HostPanel game={game} />
        <ActionBar game={game} />
      </main>
    </ToastProvider>
  );
}

/** While seated at the table, the document itself must not scroll. Join /
 *  standings screens keep normal page scroll. */
function LockViewport() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    html.style.overflow = 'hidden';
    html.style.height = '100%';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.height = '100%';
    body.style.overscrollBehavior = 'none';
    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.height = prev.htmlHeight;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
      body.style.overscrollBehavior = prev.bodyOverscroll;
    };
  }, []);
  return null;
}
