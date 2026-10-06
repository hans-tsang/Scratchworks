import { describe, expect, it } from 'vitest';
import { COLLECTIONS, TICKETS, getTicket } from '../data/tickets';
import { MAX_LUCK_LEVEL, effectiveLuck, isLuckCapped, symbolProbabilities } from '../luck';
import { analyzeTicket, countCells, evaluateCells, evaluateCounts, generateCells } from '../payout';
import { createRng } from '../rng';
import { globalLuck } from '../state';
import type { GameState } from '../types';
import { createInitialState } from '../state';

const LUCK_LEVELS = Array.from({ length: MAX_LUCK_LEVEL + 1 }, (_, i) => i);

describe('probability normalisation', () => {
  it('every ticket has positive weights summing to 1 at every luck level', () => {
    for (const ticket of TICKETS) {
      for (const luck of LUCK_LEVELS) {
        const probs = symbolProbabilities(ticket, luck);
        expect(probs).toHaveLength(ticket.symbols.length);
        for (const p of probs) {
          expect(p).toBeGreaterThan(0);
          expect(Number.isFinite(p)).toBe(true);
        }
        const total = probs.reduce((a, b) => a + b, 0);
        expect(total).toBeCloseTo(1, 10);
      }
    }
  });
});

describe('luck caps', () => {
  it('effective luck never exceeds the ticket cap', () => {
    for (const ticket of TICKETS) {
      for (const luck of LUCK_LEVELS) {
        expect(effectiveLuck(luck, ticket.luckCap)).toBeLessThanOrEqual(ticket.luckCap);
      }
    }
  });

  it('probabilities stop changing once the cap is reached', () => {
    for (const ticket of TICKETS) {
      const atCap = symbolProbabilities(ticket, ticket.luckCap);
      const beyond = symbolProbabilities(ticket, ticket.luckCap + 7);
      expect(beyond).toEqual(atCap);
      expect(isLuckCapped(ticket.luckCap, ticket)).toBe(true);
      expect(isLuckCapped(ticket.luckCap - 1, ticket)).toBe(false);
    }
  });
});

describe('symbol-to-payout consistency', () => {
  it('payout is derived from the generated symbols only', () => {
    const rng = createRng(4242);
    for (const ticket of TICKETS) {
      for (let i = 0; i < 60; i++) {
        const cells = generateCells(ticket, 5, rng);
        expect(cells).toHaveLength(ticket.cells);
        for (const cell of cells) {
          expect(ticket.symbols.some((s) => s.id === cell)).toBe(true);
        }
        const direct = evaluateCells(ticket, cells);
        const viaCounts = evaluateCounts(ticket, countCells(ticket, cells));
        expect(direct).toBeCloseTo(viaCounts, 9);
        // Re-evaluating the same symbols must always give the same payout.
        expect(evaluateCells(ticket, cells)).toBe(direct);
      }
    }
  });

  it('ticket levels only scale positive payouts, never deepen losses', () => {
    const rng = createRng(99);
    for (const ticket of TICKETS) {
      for (let i = 0; i < 80; i++) {
        const cells = generateCells(ticket, 0, rng);
        const base = evaluateCells(ticket, cells, 1);
        const upgraded = evaluateCells(ticket, cells, 1.5);
        if (base < 0) expect(upgraded).toBeGreaterThanOrEqual(base);
        else expect(upgraded).toBeGreaterThanOrEqual(base);
      }
    }
  });

  it('standard tickets can never produce a negative payout', () => {
    const rng = createRng(7);
    for (const ticket of TICKETS.filter((t) => !t.risky)) {
      for (let i = 0; i < 200; i++) {
        expect(evaluateCells(ticket, generateCells(ticket, 0, rng))).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('expected return across luck levels', () => {
  it('is exact, finite and non-decreasing in luck for every ticket', () => {
    for (const ticket of TICKETS) {
      let previous = -Infinity;
      for (const luck of LUCK_LEVELS) {
        const analysis = analyzeTicket(ticket, luck, 1);
        expect(analysis.exact).toBe(true);
        expect(Number.isFinite(analysis.expectedGross)).toBe(true);
        // More luck must never make a ticket worse.
        expect(analysis.expectedGross).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = analysis.expectedGross;
      }
    }
  });

  it('keeps non-risky tickets at a positive expected net return at luck 0', () => {
    for (const ticket of TICKETS.filter((t) => !t.risky)) {
      const analysis = analyzeTicket(ticket, 0, 1);
      expect(analysis.expectedGross).toBeGreaterThan(ticket.cost);
      expect(analysis.minPayout).toBeGreaterThanOrEqual(0);
    }
  });

  it('marks risky tickets as capable of losses', () => {
    for (const ticket of TICKETS.filter((t) => t.risky)) {
      const analysis = analyzeTicket(ticket, 0, 1);
      expect(analysis.minPayout).toBeLessThan(0);
      expect(analysis.probabilityLoss).toBeGreaterThan(0);
    }
  });

  it('gives every collection at least one reliable progression ticket', () => {
    for (const collection of COLLECTIONS) {
      const reliable = TICKETS.filter(
        (t) => t.collectionId === collection.id && !t.risky && analyzeTicket(t, 0, 1).expectedGross > t.cost,
      );
      expect(reliable.length).toBeGreaterThan(0);
    }
  });
});

describe('deterministic generation', () => {
  it('the same seed always yields the same card', () => {
    const ticket = getTicket(TICKETS[0].id);
    const a = generateCells(ticket, 3, createRng(12345));
    const b = generateCells(ticket, 3, createRng(12345));
    expect(a).toEqual(b);
  });
});

describe('luck selector', () => {
  it('reads the run luck upgrade level', () => {
    const state: GameState = createInitialState({ now: 0 });
    expect(globalLuck(state)).toBe(0);
    state.upgrades.luck = 4;
    expect(globalLuck(state)).toBe(4);
  });
});
