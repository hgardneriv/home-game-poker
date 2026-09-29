import { describe, expect, it } from 'vitest';
import { handLabel, heroHandCaption } from './hand-label';
import { Table, legalFor } from './test-utils';

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

function captionFor(t: Table, playerId: string) {
  const hand = t.state.hand;
  return heroHandCaption({
    phase: t.state.phase,
    inHand: hand?.inHand.includes(playerId) ?? false,
    folded: hand?.folded.includes(playerId) ?? false,
    myCards: hand?.holeCards[playerId] ?? null,
    board: hand?.board,
  });
}

function checkDownKeepingCaptionOff(t: Table, folder: string) {
  while (t.state.phase === 'playing') {
    expect(captionFor(t, folder)).toBeNull();
    const id = t.toAct!;
    const legal = legalFor(t.state, id);
    t.act(id, legal.canCheck ? 'check' : 'call');
    if (t.state.phase === 'playing') expect(captionFor(t, folder)).toBeNull();
  }
}

describe('heroHandCaption after fold (H2)', () => {
  it('is silent once folded even when leftover hole + flop is a royal', () => {
    const t = new Table(3);
    t.start();
    t.rig(
      { p0: ['Ah', 'Kh'], p1: ['2c', '7d'], p2: ['3c', '8d'] },
      ['Qh', 'Jh', 'Th', '2s', '4d']
    );
    expect(captionFor(t, 'p0')).toBeNull();
    t.act('p0', 'fold');
    expect(t.hand.folded).toContain('p0');
    expect(t.state.phase).toBe('playing');
    expect(captionFor(t, 'p0')).toBeNull();
    checkDownKeepingCaptionOff(t, 'p0');
    expect(t.hand.board.slice(0, 3)).toEqual(['Qh', 'Jh', 'Th']);
    expect(handLabel(['Ah', 'Kh'], t.hand.board)).toBe('Royal Flush');
    expect(captionFor(t, 'p0')).toBeNull();
  });

  it('names a pocket pair preflop and drops it the moment the hero folds', () => {
    const t = new Table(3);
    t.start();
    t.rig(
      { p0: ['9c', '9d'], p1: ['2c', '7d'], p2: ['3c', '8d'] },
      ['Ah', 'Kd', '2s', '4h', '8s']
    );
    expect(captionFor(t, 'p0')).toBe('Pair of Nines');
    t.act('p0', 'fold');
    expect(t.hand.holeCards['p0']).toEqual(['9c', '9d']);
    expect(captionFor(t, 'p0')).toBeNull();
    checkDownKeepingCaptionOff(t, 'p0');
  });

  it('stays off when phase is not playing even with a made hand', () => {
    expect(
      heroHandCaption({
        phase: 'hand-over',
        inHand: true,
        folded: false,
        myCards: ['Ah', 'Kh'],
        board: ['Qh', 'Jh', 'Th'],
      })
    ).toBeNull();
    expect(
      heroHandCaption({
        phase: 'playing',
        inHand: true,
        folded: true,
        myCards: ['9c', '9d'],
        board: [],
      })
    ).toBeNull();
  });
});
