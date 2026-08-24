import { describe, expect, it } from 'vitest';
import { Table } from '@/engine/test-utils';
import { getLegalActions } from '@/engine/betting';
import { handLabel } from '@/engine/hand-label';
import { applyDemoHand } from './demo-hands';

function demo(setup: 'pair-twos' | 'trips-kings' | 'full-house' | 'lower-chips') {
  const t = new Table(6);
  t.start();
  return applyDemoHand(t.state, setup, 2_000_000);
}

describe('applyDemoHand', () => {
  it('plants Pair of Twos, hero to act as the button', () => {
    const state = demo('pair-twos');
    const hero = state.hostId;
    const hand = state.hand!;
    expect(handLabel(hand.holeCards[hero], hand.board)).toBe('Pair of Twos');
    expect(hand.buttonSeat).toBe(state.players[hero].seat);
    expect(hand.round.toAct).toBe(hero);
    expect(hand.round.street).toBe('flop');
    expect(hand.round.currentBet).toBe(4);
    expect(getLegalActions(state, hero)?.canCheck).toBe(false);
    expect(getLegalActions(state, hero)?.callAmount).toBe(4);
  });

  it('plants Three of a Kind, Kings with a flop bet out', () => {
    const state = demo('trips-kings');
    const hero = state.hostId;
    const hand = state.hand!;
    expect(handLabel(hand.holeCards[hero], hand.board)).toBe('Three of a Kind, Kings');
    expect(hand.round.committed[hero]).toBe(4);
    expect(hand.round.toAct).not.toBe(hero);
  });

  it('plants Full House, Aces over Kings', () => {
    const state = demo('full-house');
    const hero = state.hostId;
    const hand = state.hand!;
    expect(handLabel(hand.holeCards[hero], hand.board)).toBe('Full House, Aces over Kings');
    expect(hand.board).toEqual(['Ac', 'Kh', 'Kd']);
  });

  it('plants street bets on both lower-wing seats and moves the button', () => {
    const state = demo('lower-chips');
    const hero = state.hostId;
    const hand = state.hand!;
    const heroSeat = state.players[hero].seat!;
    const left = state.seats[(heroSeat + 1) % 6]!;
    const right = state.seats[(heroSeat + 5) % 6]!;
    expect(hand.round.committed[left]).toBe(2);
    expect(hand.round.committed[right]).toBe(6);
    expect(hand.buttonSeat).toBe((heroSeat + 5) % 6);
    expect(hand.folded).not.toContain(left);
    expect(hand.folded).not.toContain(right);
  });

  it('keeps chips conserved against buy-ins', () => {
    const state = demo('pair-twos');
    const stacks = Object.values(state.players).reduce((a, p) => a + p.stack, 0);
    const pot = Object.values(state.hand!.totalCommitted).reduce((a, b) => a + b, 0);
    const buyIns = Object.values(state.players).reduce((a, p) => a + p.totalBuyIn, 0);
    expect(stacks + pot).toBe(buyIns);
  });
});
