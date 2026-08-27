import { describe, expect, it } from 'vitest';
import { faceUpHoleCards } from './seat-cards';

const result = {
  revealed: { a: ['As', 'Ah'] as [string, string] },
  hands: {
    a: ['As', 'Ah'] as [string, string],
    b: ['2c', '7d'] as [string, string],
  },
};

describe('faceUpHoleCards', () => {
  it('hero always sees their own hole cards', () => {
    expect(faceUpHoleCards(true, 'a', ['9c', '9d'], result)).toEqual(['9c', '9d']);
    expect(faceUpHoleCards(true, 'a', null, null)).toBeUndefined();
  });

  it('turns an auto-mucked opponent who stayed to showdown', () => {
    expect(faceUpHoleCards(false, 'b', null, result)).toEqual(['2c', '7d']);
  });

  it('turns the opponent who was required to show', () => {
    expect(faceUpHoleCards(false, 'a', null, result)).toEqual(['As', 'Ah']);
  });

  it('keeps mid-hand opponents face-down', () => {
    expect(faceUpHoleCards(false, 'b', null, null)).toBeUndefined();
  });

  it('does not invent cards on a fold-win (empty hands and revealed)', () => {
    expect(
      faceUpHoleCards(false, 'b', null, { hands: {}, revealed: {} })
    ).toBeUndefined();
  });

  it('falls back to revealed when hands is missing (legacy frames)', () => {
    expect(
      faceUpHoleCards(false, 'a', null, { hands: {}, revealed: { a: ['Kd', 'Kc'] } })
    ).toEqual(['Kd', 'Kc']);
  });
});
