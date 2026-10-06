import { round2 } from './format';
import { symbolProbabilities } from './luck';
import { weightedIndex, type Rng } from './rng';
import { MATCH_GROUP_MULTIPLIER } from './data/tickets';
import type { TicketDef } from './types';

/**
 * ───────────────────────────────────────────────────────────────────────────
 *  OUTCOME GENERATION AND PAYOUT EVALUATION
 * ───────────────────────────────────────────────────────────────────────────
 * The symbols on a card are generated exactly once, when the card is bought.
 * The payout is always *derived* from those symbols, so the number the player
 * sees can never contradict the card face, and reloading never rerolls a card.
 *
 * For all three ticket kinds the payout depends only on how many of each
 * symbol appear (not where they appear), which makes an exact expected-value
 * calculation possible by enumerating symbol count vectors.
 */

/** Rolls the symbols for a card. */
export function generateCells(ticket: TicketDef, globalLuck: number, rng: Rng): string[] {
  const probs = symbolProbabilities(ticket, globalLuck);
  const cells: string[] = [];
  for (let i = 0; i < ticket.cells; i++) {
    cells.push(ticket.symbols[weightedIndex(probs, rng)].id);
  }
  return cells;
}

/** Counts how many times each symbol (by definition order) appears. */
export function countCells(ticket: TicketDef, cells: string[]): number[] {
  const counts = new Array(ticket.symbols.length).fill(0);
  for (const id of cells) {
    const index = ticket.symbols.findIndex((s) => s.id === id);
    if (index >= 0) counts[index] += 1;
  }
  return counts;
}

/**
 * Payout for a symbol count vector, in Workshop Credits.
 *
 * `levelMultiplier` is the ticket-level payout bonus. It is applied to the
 * positive part of the payout only, so upgrading a ticket can never make a
 * bad Garden Harvest card worse.
 */
export function evaluateCounts(
  ticket: TicketDef,
  counts: readonly number[],
  levelMultiplier = 1,
): number {
  let positive = 0;
  let negative = 0;

  if (ticket.kind === 'match3') {
    for (let i = 0; i < ticket.symbols.length; i++) {
      const symbol = ticket.symbols[i];
      const n = counts[i];
      if (symbol.value <= 0 || n < 3) continue;
      positive += symbol.value * (MATCH_GROUP_MULTIPLIER[n] ?? 0);
    }
  } else if (ticket.kind === 'trail') {
    let coinSum = 0;
    let multiplier = 1;
    for (let i = 0; i < ticket.symbols.length; i++) {
      const symbol = ticket.symbols[i];
      const n = counts[i];
      if (n === 0) continue;
      if (symbol.role === 'coin') coinSum += symbol.value * n;
      else if (symbol.role === 'mult') multiplier *= Math.pow(symbol.value, n);
    }
    positive = coinSum * multiplier;
  } else {
    for (let i = 0; i < ticket.symbols.length; i++) {
      const symbol = ticket.symbols[i];
      const n = counts[i];
      if (n === 0) continue;
      if (symbol.value >= 0) positive += symbol.value * n;
      else negative += -symbol.value * n;
    }
  }

  return round2((positive * levelMultiplier - negative) * ticket.cost);
}

/** Payout derived from the visible card face. */
export function evaluateCells(ticket: TicketDef, cells: string[], levelMultiplier = 1): number {
  return evaluateCounts(ticket, countCells(ticket, cells), levelMultiplier);
}

/** Enumerates every count vector of `cells` items over `k` symbols. */
function forEachCountVector(
  k: number,
  cells: number,
  visit: (counts: number[], multinomial: number) => void,
): void {
  const counts = new Array(k).fill(0);
  const factorial: number[] = [1];
  for (let i = 1; i <= cells; i++) factorial[i] = factorial[i - 1] * i;

  const recurse = (index: number, remaining: number) => {
    if (index === k - 1) {
      counts[index] = remaining;
      let denom = 1;
      for (let i = 0; i < k; i++) denom *= factorial[counts[i]];
      visit(counts, factorial[cells] / denom);
      return;
    }
    for (let n = 0; n <= remaining; n++) {
      counts[index] = n;
      recurse(index + 1, remaining - n);
    }
    counts[index] = 0;
  };

  recurse(0, cells);
}

export interface TicketAnalysis {
  /** Exact expected gross payout in credits. */
  expectedGross: number;
  /** Exact expected profit after the purchase price. */
  expectedNet: number;
  /** expectedGross / cost. */
  returnRatio: number;
  /** Probability the card pays nothing at all. */
  probabilityZero: number;
  /** Probability the card is worth less than ¤0. */
  probabilityLoss: number;
  /** Probability the card at least covers its own cost. */
  probabilityProfit: number;
  /** Best and worst possible card faces. */
  maxPayout: number;
  minPayout: number;
  /** True when these numbers are exact rather than sampled. */
  exact: true;
}

const analysisCache = new Map<string, TicketAnalysis>();

/**
 * Exact analysis of a ticket at a given luck level. Values are exact because
 * every payout rule depends only on symbol counts, so the full multinomial
 * distribution can be enumerated (at most a few thousand terms).
 */
export function analyzeTicket(
  ticket: TicketDef,
  globalLuck: number,
  levelMultiplier = 1,
): TicketAnalysis {
  const key = `${ticket.id}|${Math.floor(globalLuck)}|${levelMultiplier}`;
  const cached = analysisCache.get(key);
  if (cached) return cached;

  const probs = symbolProbabilities(ticket, globalLuck);
  let expected = 0;
  let pZero = 0;
  let pLoss = 0;
  let pProfit = 0;
  let max = -Infinity;
  let min = Infinity;

  forEachCountVector(ticket.symbols.length, ticket.cells, (counts, multinomial) => {
    let p = multinomial;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > 0) p *= Math.pow(probs[i], counts[i]);
    }
    if (p <= 0) return;
    const payout = evaluateCounts(ticket, counts, levelMultiplier);
    expected += p * payout;
    if (payout === 0) pZero += p;
    if (payout < 0) pLoss += p;
    if (payout > ticket.cost) pProfit += p;
    if (payout > max) max = payout;
    if (payout < min) min = payout;
  });

  const analysis: TicketAnalysis = {
    expectedGross: expected,
    expectedNet: expected - ticket.cost,
    returnRatio: expected / ticket.cost,
    probabilityZero: pZero,
    probabilityLoss: pLoss,
    probabilityProfit: pProfit,
    maxPayout: Number.isFinite(max) ? max : 0,
    minPayout: Number.isFinite(min) ? min : 0,
    exact: true,
  };
  analysisCache.set(key, analysis);
  return analysis;
}
