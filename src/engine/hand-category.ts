import { CATEGORY } from './evaluator';

/**
 * Hold'em made-hand buckets for house / bot stats. Royal is split out of
 * straight flush so the page can sit next to published 7-card frequencies.
 */

export const HAND_KINDS = [
  'highCard',
  'pair',
  'twoPair',
  'trips',
  'straight',
  'flush',
  'fullHouse',
  'quads',
  'straightFlush',
  'royalFlush',
] as const;

export type HandKind = (typeof HAND_KINDS)[number];

export const HAND_KIND_LABELS: Record<HandKind, string> = {
  highCard: 'High card',
  pair: 'Pair',
  twoPair: 'Two pair',
  trips: 'Three of a kind',
  straight: 'Straight',
  flush: 'Flush',
  fullHouse: 'Full house',
  quads: 'Four of a kind',
  straightFlush: 'Straight flush',
  royalFlush: 'Royal flush',
};

export type HandCounts = Record<HandKind, number>;

export function emptyHandCounts(): HandCounts {
  return {
    highCard: 0,
    pair: 0,
    twoPair: 0,
    trips: 0,
    straight: 0,
    flush: 0,
    fullHouse: 0,
    quads: 0,
    straightFlush: 0,
    royalFlush: 0,
  };
}

/**
 * Exact 7-card poker frequencies from C(52,7) = 133,784,560. Royal flush is
 * carved out of the straight-flush count (Wikipedia / standard tables).
 * A player's hole cards + a five-card board are a uniform 7-subset, so these
 * are also the Hold'em rates for anyone who sees a river.
 */
export const EXPECTED_7CARD_RATES: Record<HandKind, number> = {
  royalFlush: 4_324 / 133_784_560,
  straightFlush: 37_260 / 133_784_560,
  quads: 224_848 / 133_784_560,
  fullHouse: 3_473_184 / 133_784_560,
  flush: 4_047_644 / 133_784_560,
  straight: 6_180_020 / 133_784_560,
  trips: 6_461_620 / 133_784_560,
  twoPair: 31_433_400 / 133_784_560,
  pair: 58_627_800 / 133_784_560,
  highCard: 23_294_460 / 133_784_560,
};

/**
 * Absolute tolerance on an observed rate vs {@link EXPECTED_7CARD_RATES}.
 * Common hands (≥2%): ±1.5pp. Mid (0.1–2%): ±0.25pp. Rare: ±0.15pp
 * (a 30k sample is not expected to hit a royal).
 */
export function rateTolerance(expected: number): number {
  if (expected >= 0.02) return 0.015;
  if (expected >= 0.001) return 0.0025;
  return 0.0015;
}

export function madeHandKind(score: number): HandKind {
  const cat = score >> 20;
  if (cat === CATEGORY.straightFlush) {
    const high = (score >> 16) & 0xf;
    return high === 14 ? 'royalFlush' : 'straightFlush';
  }
  switch (cat) {
    case CATEGORY.quads:
      return 'quads';
    case CATEGORY.fullHouse:
      return 'fullHouse';
    case CATEGORY.flush:
      return 'flush';
    case CATEGORY.straight:
      return 'straight';
    case CATEGORY.trips:
      return 'trips';
    case CATEGORY.twoPair:
      return 'twoPair';
    case CATEGORY.pair:
      return 'pair';
    default:
      return 'highCard';
  }
}
