'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { GameApi } from '@/hooks/useGame';
import { useOrientation } from '@/hooks/useOrientation';
import { Seat } from './Seat';
import { PlayingCard, SUIT_PATH } from './PlayingCard';
import { reviewingLastHand } from '@/engine/types';

/**
 * Party felt: four-suit motif + static confetti/streamers in a data-URI
 * SVG. Backgrounds rasterize once — no filters/blurs on the table
 * (they wedge older iOS GPUs).
 */
const FELT_TILE = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>` +
    `<g fill='#000000' fill-opacity='0.075'>` +
    `<path transform='translate(18,16)' d='${SUIT_PATH.s}'/>` +
    `<path transform='translate(108,22)' d='${SUIT_PATH.c}'/>` +
    `<path transform='translate(24,102)' d='${SUIT_PATH.d}'/>` +
    `<path transform='translate(96,88)' d='${SUIT_PATH.h}'/>` +
    `</g>` +
    `<g fill='none' stroke='#d8b45c' stroke-opacity='0.14' stroke-width='1.4' stroke-linecap='round'>` +
    `<path d='M8 52 Q36 38 62 56'/>` +
    `<path d='M92 18 Q118 8 146 24'/>` +
    `<path d='M70 118 Q98 132 128 116'/>` +
    `</g>` +
    `<g>` +
    `<circle cx='72' cy='44' r='2.4' fill='#f0d78c' fill-opacity='0.22'/>` +
    `<circle cx='148' cy='70' r='1.7' fill='#e8a07a' fill-opacity='0.20'/>` +
    `<circle cx='54' cy='138' r='2' fill='#d8b45c' fill-opacity='0.20'/>` +
    `<circle cx='132' cy='128' r='1.8' fill='#f5e6c8' fill-opacity='0.18'/>` +
    `<circle cx='12' cy='68' r='1.5' fill='#e07a7a' fill-opacity='0.16'/>` +
    `<circle cx='88' cy='78' r='1.4' fill='#f0d78c' fill-opacity='0.18'/>` +
    `<path d='M40 80 l2.4 3.2 -2.4 3.2 -2.4-3.2 z' fill='#d8b45c' fill-opacity='0.18'/>` +
    `<path d='M118 98 l2.1 2.8 -2.1 2.8 -2.1-2.8 z' fill='#f0d78c' fill-opacity='0.16'/>` +
    `</g>` +
    `</svg>`
)}")`;

const FELT_LAYERS = [
  'radial-gradient(ellipse at 50% 30%, rgba(255,220,120,0.16) 0%, rgba(255,255,255,0) 56%)',
  'radial-gradient(ellipse at 18% 72%, rgba(255,170,90,0.07) 0%, rgba(255,255,255,0) 42%)',
  FELT_TILE,
  'radial-gradient(ellipse at 50% 38%, #1fa86c 0%, #0f6a40 46%, #062918 100%)',
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

/** Stacked Poker Party lockup — chip-O, ace tucked behind, sticker outline.
 *  SVG strokes/fills only (no CSS filter) so older iOS GPUs stay happy. */
function FeltLogo() {
  const partyFont = 'var(--font-party), ui-sans-serif, system-ui, sans-serif';
  return (
    <div className="pointer-events-none relative select-none text-center">
      <div
        className="absolute left-1/2 top-[55%] h-40 w-56 max-w-[70vw] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            'radial-gradient(closest-side, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 100%)',
        }}
      />
      <span className="sr-only">POKER PARTY</span>
      <svg
        viewBox="0 0 320 188"
        className="relative mx-auto h-auto w-[10.5rem] sm:w-[14.5rem]"
        aria-hidden
        style={{ fontFamily: partyFont }}
      >
        {/* 3D offset — drawn first, no filter */}
        <g transform="translate(6 7)" fill="#122038" opacity="0.32">
          <text x="58" y="102" fontSize="64" fontWeight="900">
            P
          </text>
          <text x="134" y="102" fontSize="64" fontWeight="900">
            ker
          </text>
          <circle cx="110" cy="80" r="23" />
          <text x="40" y="164" fontSize="72" fontWeight="900">
            Party
          </text>
        </g>

        {/* Ace of hearts, tucked behind the P */}
        <g transform="rotate(-20 56 62)">
          <rect x="22" y="14" width="56" height="78" rx="7" fill="#fff" stroke="#d6dce6" strokeWidth="1.5" />
          <path transform="translate(37,26) scale(0.78)" d={SUIT_PATH.h} fill="#e11d2a" />
        </g>

        {/* Poker */}
        <text
          x="58"
          y="102"
          fontSize="64"
          fontWeight="900"
          fill="#1b2a4a"
          stroke="#fff"
          strokeWidth="12"
          strokeLinejoin="round"
          paintOrder="stroke fill"
        >
          P
        </text>
        <text
          x="134"
          y="102"
          fontSize="64"
          fontWeight="900"
          fill="#1b2a4a"
          stroke="#fff"
          strokeWidth="12"
          strokeLinejoin="round"
          paintOrder="stroke fill"
        >
          ker
        </text>
        <g transform="translate(110 80)">
          <circle r="24" fill="#fff" />
          <circle r="19.5" fill="#e11d2a" />
          <circle r="15.4" fill="none" stroke="#fff" strokeWidth="3.4" strokeDasharray="3.6 5.2" strokeLinecap="round" />
          <circle r="7.4" fill="#fff" />
          <circle r="4.8" fill="#e11d2a" />
        </g>

        {/* Party */}
        <text
          x="40"
          y="164"
          fontSize="72"
          fontWeight="900"
          fill="#dc2626"
          stroke="#fff"
          strokeWidth="12"
          strokeLinejoin="round"
          paintOrder="stroke fill"
        >
          Party
        </text>
      </svg>
      <div className="relative -mt-0.5 flex items-center justify-center gap-2 whitespace-nowrap">
        <span className="h-px w-8 bg-gradient-to-r from-transparent to-amber-200/50 sm:w-12" />
        <span
          className="text-[9px] tracking-[0.38em] text-amber-100/70 sm:text-[11px] sm:tracking-[0.42em]"
          style={{ paddingLeft: '0.38em' }}
        >
          TEXAS HOLD&apos;EM
        </span>
        <span className="h-px w-8 bg-gradient-to-l from-transparent to-amber-200/50 sm:w-12" />
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
          backgroundSize: 'auto, auto, 120px 120px, auto',
          backgroundRepeat: 'no-repeat, no-repeat, repeat, no-repeat',
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
          winners grow up over POKER PARTY. */}
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
