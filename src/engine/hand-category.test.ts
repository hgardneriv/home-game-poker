import { describe, expect, it } from 'vitest';
import { newDeck, shuffle } from './deck';
import { evaluate5, evaluate7 } from './evaluator';
import { seededRandInt } from './test-utils';
import {
  EXPECTED_7CARD_RATES,
  HAND_KINDS,
  emptyHandCounts,
  madeHandKind,
  rateTolerance,
} from './hand-category';

describe('madeHandKind', () => {
  it('splits royal flush from other straight flushes', () => {
    expect(madeHandKind(evaluate5(['As', 'Ks', 'Qs', 'Js', 'Ts']))).toBe('royalFlush');
    expect(madeHandKind(evaluate5(['9c', '8c', '7c', '6c', '5c']))).toBe('straightFlush');
  });

  it('maps every other category', () => {
    expect(madeHandKind(evaluate5(['9c', '9d', '9h', '9s', '2c']))).toBe('quads');
    expect(madeHandKind(evaluate5(['Kc', 'Kd', 'Kh', '4s', '4c']))).toBe('fullHouse');
    expect(madeHandKind(evaluate5(['Ah', 'Jh', '8h', '5h', '2h']))).toBe('flush');
    expect(madeHandKind(evaluate5(['9c', '8d', '7h', '6s', '5c']))).toBe('straight');
    expect(madeHandKind(evaluate5(['7c', '7d', '7h', 'Ks', '2c']))).toBe('trips');
    expect(madeHandKind(evaluate5(['Ac', 'Ad', '8h', '8s', '2c']))).toBe('twoPair');
    expect(madeHandKind(evaluate5(['Jc', 'Jd', '9h', '5s', '2c']))).toBe('pair');
    expect(madeHandKind(evaluate5(['Ac', 'Jd', '9h', '5s', '2c']))).toBe('highCard');
  });
});

describe('7-card Hold’em frequencies', () => {
  /**
   * Published C(52,7) rates (royal split out of SF). A 30k random 7-card
   * sample must land inside {@link rateTolerance}: ±1.5pp when expected ≥2%,
   * ±0.25pp for 0.1–2%, ±0.15pp for rarer hands.
   */
  it('evaluate7 rates sit near expected frequencies within the stated tolerance', () => {
    const SAMPLE = 30_000;
    const rand = seededRandInt(20260924);
    const counts = emptyHandCounts();
    for (let i = 0; i < SAMPLE; i++) {
      const seven = shuffle(newDeck(), rand).slice(0, 7);
      counts[madeHandKind(evaluate7(seven))]++;
    }

    const sum = HAND_KINDS.reduce((a, k) => a + counts[k], 0);
    expect(sum).toBe(SAMPLE);

    for (const kind of HAND_KINDS) {
      const expected = EXPECTED_7CARD_RATES[kind];
      const observed = counts[kind] / SAMPLE;
      const tol = rateTolerance(expected);
      expect(
        Math.abs(observed - expected),
        `${kind}: observed ${(observed * 100).toFixed(3)}% vs expected ${(expected * 100).toFixed(3)}% (tol ±${(tol * 100).toFixed(2)}pp)`
      ).toBeLessThanOrEqual(tol);
    }
  });
});
