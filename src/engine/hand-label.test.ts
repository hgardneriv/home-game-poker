import { describe, expect, it } from 'vitest';
import { handLabel } from './hand-label';

/**
 * Live hand labels (ported from the dealers-choice UX pass, 2026-07-30),
 * reduced to hold'em: card counts are only ever 2/5/6/7, so the partial
 * path is exactly the pocket-pair check.
 *
 * Known-equivalent surviving mutants (documented in the reference repo's
 * scoped Stryker pass):
 * - bestOf `cards.length === 5` fast path → false: the combination path
 *   computes the identical score for 5 cards (perf only).
 * - bestOf `score > best` → `>=`: ties overwrite best with an equal
 *   value — same result.
 * - `slice(0, 7)` in handLabel: defensive shape only — hold'em callers
 *   pass at most 2 + 5 cards.
 * - the `board = []` default: only omitted-board calls see it, and those
 *   carry exactly 0 or 2 hole cards — the partial path never reads board.
 */

describe('handLabel', () => {
  it('names a pocket pair preflop and stays quiet otherwise', () => {
    expect(handLabel(['Ah', 'Ad'])).toBe('Pair of Aces');
    expect(handLabel(['2c', '2d'])).toBe('Pair of Twos');
    expect(handLabel(['Ah', 'Kd'])).toBeNull();
    expect(handLabel([])).toBeNull();
  });

  it('evaluates real hands from the flop on, silent on high card', () => {
    expect(handLabel(['2c', '7d'], ['4h', '9s', 'Jd'])).toBeNull();
    expect(handLabel(['Ah', '2d'], ['Ac', '7s', '9d'])).toBe('Pair of Aces');
    expect(handLabel(['Ah', '8d'], ['Ac', '8s', '2d'])).toBe('Two Pair, Aces and Eights');
    expect(handLabel(['2h', '5h'], ['9h', 'Jh', 'Kh'])).toBe('Flush, King High');
    expect(handLabel(['Ah', 'Kh'], ['Qh', 'Jh', 'Th'])).toBe('Royal Flush');
  });

  it('sweeps all 5-card combinations on the turn and river', () => {
    // Six cards: the best five must include the LAST card.
    expect(handLabel(['2h', '5h'], ['9h', 'Jh', '2c', 'Kh'])).toBe('Flush, King High');
    // Seven cards: straight hides among the pair noise.
    expect(handLabel(['Ah', 'Kd'], ['Qh', 'Jh', 'Th', '2c', '2d'])).toBe('Straight, Ace High');
  });
});
