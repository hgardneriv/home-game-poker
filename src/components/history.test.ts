import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@/engine/types';
import { Table } from '@/engine/test-utils';
import { describeEvent } from './history';

const names = (id: string) => ({ a: 'Alice', b: 'Bob', c: 'Carol' })[id] ?? id;

function ev(type: string, data: unknown): GameEvent {
  return { seq: 1, at: 0, type, data };
}

describe('describeEvent hand-result audit trail', () => {
  it('showdown: winner paid, every remaining player’s cards, made hands, and board', () => {
    expect(
      describeEvent(
        ev('hand-result', {
          kind: 'showdown',
          pots: [{ amount: 20, winners: ['a'], eligible: ['a', 'b'] }],
          payouts: { a: 20 },
          refunds: {},
          revealed: { a: ['As', 'Ah'] },
          hands: { a: ['As', 'Ah'], b: ['2c', '7d'] },
          showdownOrder: ['a', 'b'],
          descriptions: { a: 'Pair of Aces', b: 'High Card Queen' },
          board: ['4h', '9s', 'Jd', 'Qc', '6h'],
        }),
        names
      )
    ).toEqual([
      'Alice wins $20 with As Ah — Pair of Aces',
      'Bob had 2c 7d — High Card Queen',
      'Board: 4h 9s Jd Qc 6h',
    ]);
  });

  it('split pot uses per-winner awarded amounts (odd chip to the first winner)', () => {
    expect(
      describeEvent(
        ev('hand-result', {
          kind: 'showdown',
          pots: [{ amount: 101, winners: ['a', 'b'], eligible: ['a', 'b'] }],
          payouts: { a: 51, b: 50 },
          refunds: {},
          revealed: { a: ['As', 'Kh'], b: ['Ad', 'Qd'] },
          descriptions: {
            a: 'Two Pair, Aces and Kings',
            b: 'Two Pair, Aces and Queens',
          },
          board: ['Ac', 'Kc', '2d', '9h', '7s'],
        }),
        names
      )
    ).toEqual([
      'Alice wins $51 with As Kh — Two Pair, Aces and Kings',
      'Bob wins $50 with Ad Qd — Two Pair, Aces and Queens',
      'Board: Ac Kc 2d 9h 7s',
    ]);
  });

  it('side pots list each winner, the mucked contestant, and a pot breakdown', () => {
    expect(
      describeEvent(
        ev('hand-result', {
          kind: 'showdown',
          pots: [
            { amount: 60, winners: ['a'], eligible: ['a', 'b', 'c'] },
            { amount: 40, winners: ['b'], eligible: ['b', 'c'] },
          ],
          payouts: { a: 60, b: 40 },
          refunds: {},
          revealed: { a: ['As', 'Ac'], b: ['Kh', 'Qs'] },
          hands: { a: ['As', 'Ac'], b: ['Kh', 'Qs'], c: ['Jd', '9d'] },
          showdownOrder: ['a', 'b', 'c'],
          descriptions: {
            a: 'Three of a Kind, Aces',
            b: 'Two Pair, Kings and Nines',
            c: 'Two Pair, Nines and Fours',
          },
          board: ['Ah', 'Kd', '9c', '2s', '4h'],
        }),
        names
      )
    ).toEqual([
      'Alice wins $60 with As Ac — Three of a Kind, Aces',
      'Bob wins $40 with Kh Qs — Two Pair, Kings and Nines',
      'Carol had Jd 9d — Two Pair, Nines and Fours',
      'Pots: $60 → Alice; $40 → Bob',
      'Board: Ah Kd 9c 2s 4h',
    ]);
  });

  it('does not list hole cards on anything but a settled hand-result', () => {
    expect(describeEvent(ev('action', { playerId: 'a', move: 'raise', amount: 10 }), names)).toEqual([
      'Alice raises to $10',
    ]);
    expect(
      describeEvent(ev('street-dealt', { street: 'flop', cards: ['4h', '9s', 'Jd'] }), names)
    ).toEqual(['flop: 4h 9s Jd']);
  });

  it('fold win records the awarded pot as uncontested and does not invent cards', () => {
    expect(
      describeEvent(
        ev('hand-result', {
          kind: 'foldWin',
          pots: [{ amount: 30, winners: ['a'], eligible: ['a'] }],
          payouts: { a: 30 },
          refunds: {},
          revealed: {},
          descriptions: {},
          board: [],
        }),
        names
      )
    ).toEqual(['Alice wins $30 (uncontested)']);
  });

  it('lists uncalled refunds separately from pot winnings', () => {
    expect(
      describeEvent(
        ev('hand-result', {
          kind: 'showdown',
          pots: [{ amount: 20, winners: ['a'], eligible: ['a', 'b'] }],
          payouts: { a: 25 },
          refunds: { a: 5 },
          revealed: { a: ['Ah', 'Kd'] },
          descriptions: { a: 'Pair of Aces' },
          board: ['As', '7c', '2d', '9h', '3s'],
        }),
        names
      )
    ).toEqual([
      'Alice wins $20 with Ah Kd — Pair of Aces',
      '$5 uncalled returned to Alice',
      'Board: As 7c 2d 9h 3s',
    ]);
  });

  it('falls back to pot math when payouts are missing (legacy events)', () => {
    expect(
      describeEvent(
        ev('hand-result', {
          kind: 'showdown',
          pots: [{ amount: 101, winners: ['a', 'b'] }],
          revealed: { a: ['As', 'Ah'], b: ['Ad', 'Ac'] },
          descriptions: { a: 'Pair of Aces', b: 'Pair of Aces' },
          board: ['2h', '7s', '9d', '3c', '8h'],
        }),
        names
      )
    ).toEqual([
      'Alice wins $51 with As Ah — Pair of Aces',
      'Bob wins $50 with Ad Ac — Pair of Aces',
      'Board: 2h 7s 9d 3c 8h',
    ]);
  });
});

describe('describeEvent other lines', () => {
  it('still formats the table chatter the history already showed', () => {
    expect(describeEvent(ev('hand-started', { handNo: 3 }), names)).toEqual(['— Hand #3 —']);
    expect(describeEvent(ev('turn', { playerId: 'a' }), names)).toEqual([]);
  });
});

describe('describeEvent against a settled engine hand', () => {
  it('lists every remaining hand only after the pot is awarded', () => {
    const t = new Table(2);
    const tableNames = (id: string) => t.state.players[id]?.name ?? id;
    t.start();
    t.rig({ p0: ['As', 'Ah'], p1: ['2c', '7d'] }, ['4h', '9s', 'Jd', 'Qc', '6h']);

    const before = t.state.events.flatMap((e) => describeEvent(e, tableNames)).join('\n');
    expect(before).not.toMatch(/As Ah|2c 7d/);

    t.act('p0', 'raise', 10);
    t.act('p1', 'call');
    t.checkDown();

    const result = t.state.events.find((e) => e.type === 'hand-result');
    expect(describeEvent(result!, tableNames)).toEqual([
      'P0 wins $20 with As Ah — Pair of Aces',
      'P1 had 2c 7d — High Card Queen',
      'Board: 4h 9s Jd Qc 6h',
    ]);
  });
});
