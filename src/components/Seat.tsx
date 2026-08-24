'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { GameApi } from '@/hooks/useGame';
import { handLabel } from '@/engine/hand-label';
import { PlayingCard } from './PlayingCard';

export function Seat({
  game,
  seatIndex,
  playerId,
}: {
  game: GameApi;
  seatIndex: number;
  playerId: string | null;
}) {
  const state = game.state!;
  const hand = state.hand;
  const player = playerId ? state.players[playerId] : null;

  const isActing = !!player && hand?.toAct === player.id && state.phase === 'playing';

  // Smooth countdown: tick every 250ms while acting; the bar interpolates.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!isActing) return;
    const t = setInterval(() => forceTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [isActing]);

  if (!player) {
    return (
      <div className="flex h-14 w-20 items-center justify-center rounded-2xl border border-dashed border-white/20 text-[11px] text-white/40">
        open seat
      </div>
    );
  }

  const inHand = hand?.inHand.includes(player.id) ?? false;
  const folded = hand?.folded.includes(player.id) ?? false;
  const allIn = hand?.allIn.includes(player.id) ?? false;
  const isYou = player.id === state.yourId;
  const isWinner =
    (hand?.result?.pots.some((p) => p.winners.includes(player.id)) ?? false) &&
    state.phase !== 'playing';
  const revealed = hand?.result?.revealed[player.id];
  const showCards = isYou ? hand?.myCards : revealed;
  const description = hand?.result?.descriptions[player.id];

  // Casino-machine courtesy: name your made hand as it develops. Hero only —
  // opponents have no face-up cards mid-hand, and showdown reveals already
  // get descriptions from the result.
  const liveLabel =
    isYou && hand && state.phase === 'playing' && inHand && !folded
      ? handLabel(hand.myCards ?? [], hand.board)
      : null;

  const timerFraction = (() => {
    if (!isActing || !hand?.actionDeadline) return null;
    const total = state.config.actionTimeMs;
    const left = hand.actionDeadline - game.serverNow();
    return Math.max(0, Math.min(1, left / total));
  })();

  const badge =
    hand && !hand.deadSb && hand.sbSeat === seatIndex
      ? 'SB'
      : hand && hand.bbSeat === seatIndex
        ? 'BB'
        : null;

  // Hero bet + dealer button sit to the right of the hole cards, under the
  // caption — clear of a long label. D sits above the bet chip.
  const heroBet =
    isYou && hand && !hand.result ? (hand.committed[player.id] ?? 0) : 0;
  const heroIsDealer = isYou && !!hand && hand.buttonSeat === seatIndex;

  return (
    <motion.div
      // Your own folded seat stays a bit more legible so you can read your cards.
      animate={{ opacity: folded ? (isYou ? 0.65 : 0.45) : 1 }}
      // Your seat gets an ornate gold-trimmed plaque; opponents stay compact.
      data-testid={isYou ? 'hero-seat' : undefined}
      className={`relative flex w-max min-w-24 max-w-36 flex-col items-center overflow-visible sm:max-w-48 ${
        isYou
          ? 'rounded-xl border border-amber-400/50 bg-black/40 px-2 pb-1 pt-2 shadow-[0_0_0_3px_rgba(0,0,0,0.35),inset_0_0_0_2px_rgba(216,180,92,0.15),0_4px_14px_rgba(0,0,0,0.45)]'
          : ''
      }`}
    >
      {/* Made-hand caption floats on the felt above the cards — lots of
          table room, and it never fights the nameplate. Live (emerald)
          during play; showdown winner (amber) after. */}
      {liveLabel && (
        <HandCaption text={liveLabel} tone="live" yours={isYou} />
      )}
      {description && isWinner && (
        <HandCaption text={description} tone="showdown" yours={isYou} />
      )}

      {/* Cards peeking above the plate. After folding, you (and only you)
          still see your own cards greyed out — to watch what might have been.
          Face-up cards (yours, or anyone's at showdown) sit fully clear of
          the plate so the bottom index isn't cut off; face-down backs tuck. */}
      <div
        className={`relative z-0 flex gap-0.5 ${showCards ? 'mb-1' : '-mb-2'} ${
          folded ? 'opacity-70 grayscale' : ''
        }`}
      >
        {inHand && !folded && !showCards && (
          <>
            <PlayingCard size="sm" />
            <PlayingCard size="sm" />
          </>
        )}
        {inHand && showCards && (!folded || isYou) && (
          <>
            <PlayingCard card={showCards[0]} size={isYou ? 'md' : 'sm'} dealt />
            <PlayingCard card={showCards[1]} size={isYou ? 'md' : 'sm'} dealt />
          </>
        )}
        {(heroBet > 0 || heroIsDealer) && (
          <div className="absolute left-full top-1/2 z-20 ml-4 flex -translate-y-1/2 flex-col items-center gap-1">
            {heroIsDealer && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-black text-black shadow">
                D
              </span>
            )}
            <AnimatePresence>
              {heroBet > 0 && (
                <motion.div
                  key={`${hand?.street}-${heroBet}`}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="whitespace-nowrap"
                >
                  <div className="flex items-center gap-1 rounded-full bg-black/45 py-0.5 pl-0.5 pr-2 shadow">
                    <span className="inline-block h-4 w-4 rounded-full border-2 border-dashed border-white/70 bg-amber-500 shadow-inner" />
                    <span className="text-xs font-bold text-amber-300">{heroBet}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Plate */}
      <div
        // No backdrop-blur here: a blur layer per seat over the felt gradient,
        // re-sampled every frame while the timer animates, can wedge the GPU
        // process on older iOS Safari (black screen). Solid tint reads the same.
        className={`relative z-10 w-full overflow-hidden rounded-xl border px-2 py-1.5 text-center shadow-lg transition-colors ${
          isWinner
            ? 'border-amber-300 bg-amber-600/40'
            : isActing
              ? 'border-amber-400 bg-black/75'
              : 'border-white/15 bg-black/70'
        }`}
      >
        <div className="truncate text-xs font-semibold text-white">
          {player.isBot ? '🤖 ' : ''}
          {player.name}
          {isYou ? <span className="opacity-60"> · you</span> : ''}
        </div>
        <div className="text-xs font-bold text-amber-300">
          {player.status === 'busted' ? (
            <span className="text-red-400">busted</span>
          ) : allIn && state.phase === 'playing' ? (
            <span className="text-red-300">ALL IN</span>
          ) : (
            <>${player.stack}</>
          )}
          {badge && <span className="ml-1 font-medium text-white/50">{badge}</span>}
          {player.status === 'away' && <span className="ml-1">💤</span>}
        </div>

        {/* Turn timer bar */}
        {timerFraction !== null && (
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
            <div
              className={`h-full w-full origin-left ${
                timerFraction > 0.4
                  ? 'bg-emerald-400'
                  : timerFraction > 0.15
                    ? 'bg-amber-400'
                    : 'bg-red-500'
              }`}
              // scaleX, not width: compositor-only, no layout/repaint per tick.
              style={{ transform: `scaleX(${timerFraction})`, transition: 'transform 250ms linear' }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** "Pair of Kings" / "Two Pair, Kings and Queens" — sits on the felt. */
function HandCaption({
  text,
  tone,
  yours,
}: {
  text: string;
  tone: 'live' | 'showdown';
  yours: boolean;
}) {
  return (
    <div
      className={`absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/70 px-2.5 py-1 font-semibold tracking-wide shadow-lg ${
        yours ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'
      } ${tone === 'live' ? 'text-emerald-300' : 'text-amber-200'}`}
    >
      {text}
    </div>
  );
}
