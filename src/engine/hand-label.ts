import type { Card } from './types';
import { rankValue } from './deck';
import { describe, evaluate5, CATEGORY } from './evaluator';

/**
 * Live "what do these cards make" label for the table UI — the casino-machine
 * courtesy of naming any made hand as it develops ("Pair of Kings",
 * "Flush, Ace High"). Pure and client-safe: callers pass only cards the
 * viewer is entitled to see (their own hole cards + the board), so nothing
 * here can leak — it just describes.
 *
 * Returns null when the cards make nothing worth announcing (high card).
 */

const PLURALS: Record<number, string> = {
  2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens',
  8: 'Eights', 9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens',
  13: 'Kings', 14: 'Aces',
};

/** Best 5-card score from 5, 6, or 7 cards. */
function bestOf(cards: Card[]): number {
  if (cards.length === 5) return evaluate5(cards);
  let best = 0;
  const five: Card[] = [];
  const choose = (start: number, need: number): void => {
    if (need === 0) {
      const score = evaluate5(five);
      if (score > best) best = score;
      return;
    }
    for (let i = start; i <= cards.length - need; i++) {
      five.push(cards[i]);
      choose(i + 1, need - 1);
      five.pop();
    }
  };
  choose(0, 5);
  return best;
}

/** describe() the score, or null when it's just high card. */
function madeOrNull(score: number): string | null {
  return score >> 20 > CATEGORY.highCard ? describe(score) : null;
}

/**
 * Label the hand your `cards` make with the community `board`. Card counts
 * are 2 (preflop), 5, 6, or 7 by street; preflop only a pocket pair is
 * announceable (straights/flushes need five cards).
 */
export function handLabel(cards: Card[], board: Card[] = []): string | null {
  if (cards.length === 0) return null;
  const all = [...cards, ...board];
  if (all.length >= 5) return madeOrNull(bestOf(all.slice(0, 7)));
  return rankValue(all[0]) === rankValue(all[1])
    ? `Pair of ${PLURALS[rankValue(all[0])]}`
    : null;
}
