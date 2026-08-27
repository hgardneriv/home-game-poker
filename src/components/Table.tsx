'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { GameApi } from '@/hooks/useGame';
import { useOrientation } from '@/hooks/useOrientation';
import { Seat } from './Seat';
import { PlayingCard, SUIT_PATH } from './PlayingCard';
import { reviewingLastHand } from '@/engine/types';

/**
 * Felt texture: a sparse diagonal tile of dark suit motifs baked into a
 * data-URI SVG. Static backgrounds rasterize once — deliberately no
 * filters/blurs anywhere on the table (they wedge older iOS GPUs).
 */
const FELT_TILE = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>` +
    `<g fill='#000000' fill-opacity='0.06'>` +
    `<path transform='translate(16,12)' d='${SUIT_PATH.s}'/>` +
    `<path transform='translate(76,72)' d='${SUIT_PATH.c}'/>` +
    `</g></svg>`
)}")`;

const FELT_LAYERS = [
  'radial-gradient(ellipse at 50% 35%, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0) 60%)',
  FELT_TILE,
  'radial-gradient(ellipse at 50% 38%, #15714a 0%, #0d5334 45%, #05301d 100%)',
].join(', ');

/** Mahogany rail: top sheen + fine grain streaks over a deep warm radial. */
const WOOD_LAYERS = [
  'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 20%, rgba(0,0,0,0.28) 100%)',
  'repeating-linear-gradient(95deg, rgba(0,0,0,0.14) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.1) 5px, rgba(80,35,12,0.18) 8px)',
  'radial-gradient(ellipse at 50% 25%, #8a4d26 0%, #5f3115 55%, #331508 100%)',
].join(', ');

interface Point {
  x: number;
  y: number;
}

/** Seat positions (percent of table area), index 0 = hero bottom-center. */
const LAYOUTS: Record<string, Point[]> = {
  landscape: [
    { x: 50, y: 87 },
    { x: 12, y: 68 },
    { x: 12, y: 24 },
    { x: 50, y: 9 },
    { x: 88, y: 24 },
    { x: 88, y: 68 },
  ],
  portrait: [
    { x: 50, y: 86 },
    { x: 16, y: 64 },
    { x: 17, y: 28 },
    { x: 50, y: 8 },
    { x: 83, y: 28 },
    { x: 84, y: 64 },
  ],
};

/**
 * Board + pot cluster. Slightly below geometric center so the pot
 * clears the hero and the wordmark can hang in the open felt under
 * the top seat. Same stack at every canvas size — landscape used to
 * pin the mark on the flop (it read as a watermark and overlapped).
 */
const CENTERS: Record<string, Point> = {
  portrait: { x: 50, y: 54 },
  landscape: { x: 50, y: 54 },
};

/** Chip lands on the nameplate then vanishes — keep under the 2.5s fold-win hold. */
const AWARD_ARRIVE_MS = 1500;

function PotAward({
  amount,
  from,
  to,
  delay,
}: {
  amount: number;
  from: Point;
  to: Point;
  delay: number;
}) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setGone(true), delay * 1000 + AWARD_ARRIVE_MS + 250);
    return () => window.clearTimeout(t);
  }, [delay]);
  if (gone) return null;

  const secs = AWARD_ARRIVE_MS / 1000;
  return (
    <motion.div
      initial={{ left: `${from.x}%`, top: `${from.y + 8}%`, opacity: 1, scale: 1 }}
      animate={{
        left: `${to.x}%`,
        // Sit on the nameplate (below the cards / caption), not on the hand.
        top: `${Math.min(92, to.y + 5)}%`,
        opacity: [1, 1, 0],
        scale: [1.15, 1.2, 0.7],
      }}
      transition={{
        delay,
        duration: secs,
        ease: 'easeInOut',
        opacity: { delay, duration: secs, times: [0, 0.7, 1] },
        scale: { delay, duration: secs, times: [0, 0.7, 1] },
      }}
      className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2"
    >
      <div className="relative flex flex-col items-center">
        <motion.span
          className="absolute -top-7 text-3xl leading-none"
          initial={{ opacity: 1, scale: 1, rotate: -18 }}
          animate={{ opacity: [1, 1, 0], scale: [1, 1.35, 0.5], rotate: [-18, 10, 24] }}
          transition={{ delay, duration: secs, times: [0, 0.66, 0.8] }}
        >
          🔥
        </motion.span>
        <motion.span
          className="absolute -top-7 text-3xl leading-none"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: [0, 0, 1, 0], scale: [0.5, 0.5, 1.3, 1.6] }}
          transition={{ delay, duration: secs + 0.4, times: [0, 0.6, 0.76, 1] }}
        >
          💨
        </motion.span>
        <div className="flex items-center gap-1.5 rounded-full bg-black/75 px-2.5 py-1 shadow-lg">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-dashed border-white/70 bg-amber-500" />
          <span className="text-sm font-bold text-amber-200">${amount}</span>
        </div>
      </div>
    </motion.div>
  );
}

function FeltLogo() {
  return (
    <div className="pointer-events-none relative select-none text-center">
      <div
        className="absolute left-1/2 top-1/2 h-48 w-[26rem] max-w-[80vw] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            'radial-gradient(closest-side, rgba(216,180,92,0.16) 0%, rgba(216,180,92,0) 100%)',
        }}
      />
      <div
        className="relative whitespace-nowrap text-2xl leading-none tracking-[0.5em] text-black/60 sm:text-[28px]"
        style={{ paddingLeft: '0.5em' }}
      >
        ♠&nbsp;♥&nbsp;♦&nbsp;♣
      </div>
      <div
        className="relative mt-1 whitespace-nowrap bg-gradient-to-b from-amber-100 via-amber-300/95 to-amber-600/85 bg-clip-text text-xl font-black tracking-[0.3em] text-transparent sm:text-3xl"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif', paddingLeft: '0.3em' }}
      >
        HOME GAME
      </div>
      <div className="relative mt-1 flex items-center justify-center gap-2 whitespace-nowrap">
        <span className="h-px w-8 bg-amber-200/40 sm:w-12" />
        <span className="text-[10px] tracking-[0.4em] text-amber-100/60 sm:text-xs" style={{ paddingLeft: '0.4em' }}>
          TEXAS HOLD&apos;EM
        </span>
        <span className="h-px w-8 bg-amber-200/40 sm:w-12" />
      </div>
    </div>
  );
}

export function Table({ game }: { game: GameApi }) {
  const state = game.state!;
  const hand = state.hand;
  const orientation = useOrientation();
  const center = CENTERS[orientation];
  const positions = LAYOUTS[orientation];
  const mySeat = state.yourId ? (state.players[state.yourId]?.seat ?? 0) : 0;
  const slotFor = (seatIndex: number) => (seatIndex - mySeat + 6) % 6;
  const posFor = (seatIndex: number) => positions[slotFor(seatIndex)];

  const result = hand?.result ?? null;
  const winnerLines = (() => {
    if (!result || !hand) return [];
    const total: Record<string, number> = {};
    for (const pot of result.pots) {
      for (const w of pot.winners) total[w] = (total[w] ?? 0) + Math.floor(pot.amount / pot.winners.length);
    }
    return Object.entries(total).map(([id, amt]) => {
      const name = state.players[id]?.name ?? '?';
      const description = result.descriptions[id];
      return description ? `${name} wins $${amt} — ${description}` : `${name} wins $${amt}`;
    });
  })();
  const showHandBanner = winnerLines.length > 0 || reviewingLastHand(state);
  const payouts: Record<string, number> = {};
  if (result) {
    for (const pot of result.pots) {
      const share = Math.floor(pot.amount / pot.winners.length);
      for (const w of pot.winners) payouts[w] = (payouts[w] ?? 0) + share;
    }
  }

  return (
    <div
      className="absolute inset-2"
      style={{ borderRadius: orientation === 'landscape' ? '45% / 42%' : '42% / 46%' }}
    >
      {/* Wood rail */}
      <div
        className="absolute inset-0 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
        style={{ borderRadius: 'inherit', backgroundImage: WOOD_LAYERS }}
      />
      {/* Dark seam, then gold trim, between wood and felt */}
      <div
        className="pointer-events-none absolute inset-[10px] z-10 border-2 border-black/50"
        style={{ borderRadius: 'inherit' }}
      />
      <div
        className="pointer-events-none absolute inset-[12px] z-10 border border-amber-300/60"
        style={{ borderRadius: 'inherit' }}
      />
      {/* Felt */}
      <div
        className="absolute inset-[14px] shadow-[inset_0_0_80px_rgba(0,0,0,0.6)]"
        style={{
          borderRadius: 'inherit',
          backgroundImage: FELT_LAYERS,
          backgroundSize: 'auto, 120px 120px, auto',
          backgroundRepeat: 'no-repeat, repeat, no-repeat',
        }}
      />
      {/* Double gold pinstripe inside the rail — the only ornament, kept clean */}
      <div
        className="pointer-events-none absolute inset-[26px] border-2 border-amber-300/30"
        style={{ borderRadius: 'inherit' }}
      />
      <div
        className="pointer-events-none absolute inset-[32px] border border-amber-300/15"
        style={{ borderRadius: 'inherit' }}
      />

      {/* Board + pot. Wordmark hangs just above the slots (out of flow) so
          logo→cards stays tight while cards→pot keeps a real gap — same
          stack on phone, narrow, and full-screen. Winner copy overlays the
          mark (does not move it): one line covers TEXAS HOLD'EM, extra
          winners grow up over HOME GAME. */}
      <div
        className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2"
        style={{ left: `${center.x}%`, top: `${center.y}%` }}
      >
        <div className="pointer-events-none absolute bottom-full left-1/2 z-0 mb-1 w-max -translate-x-1/2">
          <FeltLogo />
        </div>
        <AnimatePresence>
          {showHandBanner && (
            <motion.div
              key={`banner-${hand?.handNo ?? 'end'}`}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.35 }}
              className="absolute bottom-full left-1/2 z-30 mb-1 flex w-max max-w-[min(86vw,28rem)] -translate-x-1/2 flex-col items-center"
            >
              <div className="flex flex-col items-center rounded-xl border border-amber-400/40 bg-black/80 px-4 py-2 text-center shadow-xl">
                {winnerLines.map((line) => (
                  <span key={line} className="text-sm font-semibold text-amber-300">
                    🏆 {line}
                  </span>
                ))}
                {reviewingLastHand(state) && (
                  <div className="mt-1 text-xs font-medium text-white/80">
                    Last Hand - Press Results to continue
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {state.phase === 'lobby' ? (
          <div className="text-center text-white/85">
            <div className="text-sm font-medium">Waiting for players…</div>
            <div className="mt-1 text-xs opacity-70">
              blinds ${state.config.smallBlind}/${state.config.bigBlind} · buy-in $
              {state.config.startingStack}
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => {
                const card = hand?.board[i];
                return card ? (
                  <PlayingCard key={card} card={card} size="md" dealt />
                ) : (
                  <div
                    key={`slot${i}`}
                    className="w-12 aspect-[20/29] rounded-[4px] border border-amber-400/40 bg-[#0c2318]/90 sm:w-14"
                    style={{
                      boxShadow:
                        'inset 0 0 0 1px rgba(0,0,0,0.6), inset 0 0 0 3px rgba(216,180,92,0.22)',
                    }}
                  />
                );
              })}
            </div>
            <AnimatePresence>
              {hand && hand.potTotal > 0 && !result && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 shadow"
                >
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-dashed border-white/70 bg-amber-500" />
                  <span className="text-sm font-bold text-amber-300">${hand.potTotal}</span>
                </motion.div>
              )}
            </AnimatePresence>
            {state.phase === 'paused' && (
              <div className="rounded-full bg-black/55 px-3 py-1 text-sm text-white">⏸ Paused</div>
            )}
          </>
        )}
      </div>

      {/* Pot flies to each winner, then fades so it never sits on their cards. */}
      <AnimatePresence>
        {result &&
          hand &&
          Object.entries(payouts).map(([id, amount], i) => {
            const seat = state.players[id]?.seat ?? 0;
            const p = posFor(seat);
            return (
              <PotAward
                key={`award-${hand.handNo}-${id}`}
                amount={amount}
                from={center}
                to={p}
                delay={0.15 * i}
              />
            );
          })}
      </AnimatePresence>

      {/* Seats — bet + D render inside Seat, beside each player's cards. */}
      {state.seats.map((playerId, seatIndex) => {
        const pos = posFor(seatIndex);
        return (
          <div
            key={seatIndex}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            <Seat
              game={game}
              seatIndex={seatIndex}
              playerId={playerId}
              visualSlot={slotFor(seatIndex)}
              payout={playerId ? (payouts[playerId] ?? 0) : 0}
            />
          </div>
        );
      })}
    </div>
  );
}
