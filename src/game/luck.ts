import type { SymbolDef, TicketDef } from './types';

/**
 * ───────────────────────────────────────────────────────────────────────────
 *  LUCK MODEL
 * ───────────────────────────────────────────────────────────────────────────
 * Luck is a single global integer level. For a given ticket the *effective*
 * luck is `min(globalLuck, ticket.luckCap)` — levels above the cap do nothing
 * for that ticket, and the interface says so explicitly.
 *
 * Effect on a symbol with base weight w and affinity a ∈ {-1, 0, +1}:
 *
 *     w' = w × (1 + LUCK_STEP × effectiveLuck)^a
 *     p  = w' / Σ w'
 *
 * Because every weight stays strictly positive and the result is renormalised,
 * the probabilities always remain valid and sum to exactly 1.
 */

/** Relative weight shift per effective luck level. */
export const LUCK_STEP = 0.02;

/** Maximum purchasable global luck level. */
export const MAX_LUCK_LEVEL = 30;

export function effectiveLuck(globalLuck: number, luckCap: number): number {
  const level = Math.max(0, Math.floor(globalLuck));
  return Math.min(level, Math.max(0, luckCap));
}

/** True when extra global luck no longer changes this ticket's odds. */
export function isLuckCapped(globalLuck: number, ticket: TicketDef): boolean {
  return Math.floor(globalLuck) >= ticket.luckCap;
}

/** Adjusted weights for a ticket at a given global luck level. */
export function luckedWeights(ticket: TicketDef, globalLuck: number): number[] {
  const eff = effectiveLuck(globalLuck, ticket.luckCap);
  const factor = 1 + LUCK_STEP * eff;
  return ticket.symbols.map((s: SymbolDef) =>
    s.luckAffinity === 0 ? s.weight : s.luckAffinity > 0 ? s.weight * factor : s.weight / factor,
  );
}

/** Normalised probabilities for a ticket at a given global luck level. */
export function symbolProbabilities(ticket: TicketDef, globalLuck: number): number[] {
  const weights = luckedWeights(ticket, globalLuck);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return ticket.symbols.map(() => 1 / ticket.symbols.length);
  return weights.map((w) => w / total);
}
