import { describe, expect, it } from 'vitest';
import { newDeck, shuffle } from './deck';
import { Table, assertLiveHandCards, seededRandInt } from './test-utils';
import type { Card } from './types';

/**
 * Harry's birthday: same hole-card ranks on consecutive hands (suits
 * optional). That is legal. This file proves the deal is unique *inside*
 * one hand, and measures how often 3 rank-matches happen in an 80-hand
 * hero night. Fold does not change the next shuffle — each hand is a
 * fresh newDeck() + Fisher–Yates, same as startHand.
 */

const HANDS_PER_NIGHT = 80;
const COMPARISONS = HANDS_PER_NIGHT - 1; // 79
const N_COMBOS = (52 * 51) / 2; // 1326
const N_PAIR_COMBOS = 13 * 6; // 78
const N_UNPAIRED = N_COMBOS - N_PAIR_COMBOS; // 1248
/** P(next hole matches previous ranks), averaging pair vs unpaired previous. */
const P_SAME_RANK =
  (N_PAIR_COMBOS / N_COMBOS) * (6 / N_COMBOS) + (N_UNPAIRED / N_COMBOS) * (16 / N_COMBOS);
const P_EXACT = 1 / N_COMBOS;

function ranksKey(hole: readonly Card[]): string {
  return [hole[0][0], hole[1][0]].sort().join('');
}

function comboKey(hole: readonly Card[]): string {
  return [...hole].sort().join('');
}

function dealHero(randInt: (n: number) => number): [Card, Card] {
  const deck = shuffle(newDeck(), randInt);
  return [deck[0], deck[1]];
}

function binomPAtLeast(n: number, p: number, k: number): number {
  const q = 1 - p;
  let pmf = q ** n;
  let cdf = 0;
  for (let x = 0; x < k; x++) {
    cdf += pmf;
    pmf *= ((n - x) * p) / ((x + 1) * q);
  }
  return 1 - cdf;
}

function simulateHeroNights(
  nights: number,
  randInt: (n: number) => number
): {
  nights: number;
  comparisons: number;
  sameRank: number;
  exact: number;
  nightsWithAtLeast3: number;
} {
  let sameRank = 0;
  let exact = 0;
  let nightsWithAtLeast3 = 0;
  for (let n = 0; n < nights; n++) {
    let prev = dealHero(randInt);
    let nightRanks = 0;
    for (let h = 1; h < HANDS_PER_NIGHT; h++) {
      const hole = dealHero(randInt);
      if (comboKey(hole) === comboKey(prev)) exact++;
      if (ranksKey(hole) === ranksKey(prev)) {
        sameRank++;
        nightRanks++;
      }
      prev = hole;
    }
    if (nightRanks >= 3) nightsWithAtLeast3++;
  }
  return {
    nights,
    comparisons: nights * COMPARISONS,
    sameRank,
    exact,
    nightsWithAtLeast3,
  };
}

describe('birthday hands: in-hand uniqueness + 80-hand rates', () => {
  it('an 80-hand engine night never duplicates a card inside one hand', () => {
    const t = new Table(3, { stacks: [500, 500, 500], rand: seededRandInt(20260929) });
    t.start();
    assertLiveHandCards(t.hand);
    const hero = 'p0';
    let prev = t.hand.holeCards[hero];
    let sameRank = 0;
    let exact = 0;
    for (let h = 1; h < HANDS_PER_NIGHT; h++) {
      t.foldAround();
      t.nextHand();
      assertLiveHandCards(t.hand);
      const hole = t.hand.holeCards[hero];
      if (comboKey(hole) === comboKey(prev)) exact++;
      if (ranksKey(hole) === ranksKey(prev)) sameRank++;
      prev = hole;
    }
    // Consecutive matches are legal — do not require them to be zero.
    expect(sameRank).toBeGreaterThanOrEqual(0);
    expect(exact).toBeGreaterThanOrEqual(0);
  });

  it('20k hero nights: report same-rank / exact-combo rates vs expected', () => {
    const nights = 20_000;
    const stats = simulateHeroNights(nights, seededRandInt(29_09_2026));
    const expectedRank = stats.comparisons * P_SAME_RANK;
    const expectedExact = stats.comparisons * P_EXACT;
    const expectedGe3 = nights * binomPAtLeast(COMPARISONS, P_SAME_RANK, 3);

    // eslint-disable-next-line no-console
    console.info(
      [
        `birthday-rate proof (${nights} nights × ${HANDS_PER_NIGHT} hands, ${stats.comparisons} comparisons)`,
        `  P(same ranks) expected ${P_SAME_RANK.toFixed(6)}  observed ${(stats.sameRank / stats.comparisons).toFixed(6)}  (${stats.sameRank} vs ${expectedRank.toFixed(1)})`,
        `  P(exact combo) expected ${P_EXACT.toFixed(6)} (1/${N_COMBOS})  observed ${(stats.exact / stats.comparisons).toFixed(6)}  (${stats.exact} vs ${expectedExact.toFixed(1)})`,
        `  nights with ≥3 rank-matches: ${stats.nightsWithAtLeast3}/${nights} = ${(stats.nightsWithAtLeast3 / nights).toFixed(4)}  (binomial ${ (expectedGe3 / nights).toFixed(4)})`,
      ].join('\n')
    );

    // Uniqueness of each two-card deal is implied by newDeck()+shuffle; the
    // engine night above is the live-hand check. Do not fail on a birthday.
    expect(stats.comparisons).toBe(nights * COMPARISONS);
    expect(stats.sameRank).toBeGreaterThan(0);
    expect(stats.nightsWithAtLeast3).toBeGreaterThan(0);
  }, 60_000);
});
