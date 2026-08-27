import type { Card, HandResult } from '@/engine/types';

/**
 * Face-up hole cards at a seat. Hero always sees their own cards.
 * At showdown everyone who stayed is turned — `hands` is the full field
 * (history already publishes it). `revealed` is only the auto-muck set.
 */
export function faceUpHoleCards(
  isYou: boolean,
  playerId: string,
  myCards: [Card, Card] | null | undefined,
  result: Pick<HandResult, 'hands' | 'revealed'> | null | undefined
): [Card, Card] | undefined {
  if (isYou) return myCards ?? undefined;
  if (!result) return undefined;
  return result.hands[playerId] ?? result.revealed[playerId];
}
