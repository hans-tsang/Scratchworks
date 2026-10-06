import { clampCurrency, formatCash, round2 } from './format';
import { generateCells, evaluateCells } from './payout';
import { createRng, type Rng } from './rng';
import { getTicket } from './data/tickets';
import {
  JOB_COOLDOWN_MS,
  RUN_UPGRADE_INDEX,
  TICKET_LEVEL_MAX,
  ticketLevelCost,
  ticketLevelRequirement,
  upgradeCost,
} from './data/upgrades';
import {
  globalLuck,
  jobPayout,
  queueCapacity,
  queueUsed,
  refreshUnlocks,
  ticketLevel,
  ticketLevelMultiplier,
} from './state';
import type { Card, GameState } from './types';

/**
 * ───────────────────────────────────────────────────────────────────────────
 *  ECONOMY TRANSACTIONS
 * ───────────────────────────────────────────────────────────────────────────
 * Every money movement in the game goes through this module. The functions
 * mutate the supplied state and return a small result object; they are the
 * only place where `cash`, `runWinnings` and card status change.
 *
 * Guarantees enforced here:
 *  • a purchase subtracts the cost exactly once and only if affordable;
 *  • a card's outcome is generated once, at purchase, and never rerolled;
 *  • a card can be claimed at most once, and never after being discarded;
 *  • negative claims require explicit confirmation and are capped at the
 *    player's cash so the balance can never go below ¤0.
 */

export type FailureReason =
  | 'locked'
  | 'insufficient-funds'
  | 'queue-full'
  | 'not-found'
  | 'not-revealed'
  | 'already-resolved'
  | 'needs-confirmation'
  | 'max-level'
  | 'requirement-not-met'
  | 'cooldown';

export interface TxResult<T = undefined> {
  ok: boolean;
  reason?: FailureReason;
  value?: T;
}

function fail<T>(reason: FailureReason): TxResult<T> {
  return { ok: false, reason };
}

export function pushFeed(state: GameState, text: string, tone: 'good' | 'bad' | 'info'): void {
  state.feed.unshift({ id: state.nextFeedId++, text, tone, at: state.lastTickAt });
  if (state.feed.length > 40) state.feed.length = 40;
}

function addCash(state: GameState, amount: number): void {
  state.cash = clampCurrency(round2(Math.max(0, state.cash + amount)));
}

/** Creates an RNG whose state is stored in the save, so reloads stay fair. */
export function rngFor(state: GameState): Rng {
  const rng = createRng(state.rngState);
  return {
    next() {
      const value = rng.next();
      state.rngState = rng.getState();
      return value;
    },
    getState: rng.getState,
    setState: rng.setState,
  };
}

/* ── Purchasing ────────────────────────────────────────────────────────── */

export interface BuyOptions {
  auto?: boolean;
  /** Auto-buy must keep at least this much cash. */
  reserve?: number;
  /** Auto-buy must not exceed this queue length. */
  queueLimit?: number;
  rng?: Rng;
}

export function canBuy(state: GameState, ticketId: string, options: BuyOptions = {}): TxResult {
  const ticket = getTicket(ticketId);
  if (!state.unlockedCollections.includes(ticket.collectionId)) return fail('locked');
  const limit = Math.min(queueCapacity(state), options.queueLimit ?? Infinity);
  if (queueUsed(state) >= limit) return fail('queue-full');
  const reserve = options.reserve ?? 0;
  if (state.cash - ticket.cost < reserve - 1e-9) return fail('insufficient-funds');
  return { ok: true };
}

/** Buys a ticket: subtracts the cost once and rolls the outcome once. */
export function buyCard(state: GameState, ticketId: string, options: BuyOptions = {}): TxResult<Card> {
  const check = canBuy(state, ticketId, options);
  if (!check.ok) return check as TxResult<never>;

  const ticket = getTicket(ticketId);
  const rng = options.rng ?? rngFor(state);
  const cells = generateCells(ticket, globalLuck(state), rng);
  const payout = evaluateCells(ticket, cells, ticketLevelMultiplier(state, ticket.id));

  state.cash = clampCurrency(round2(state.cash - ticket.cost));
  const card: Card = {
    id: `c${state.nextCardId++}`,
    ticketId,
    cells,
    payout,
    cost: ticket.cost,
    progress: 0,
    status: 'unrevealed',
    purchasedAt: state.lastTickAt,
    auto: options.auto ?? false,
  };
  state.cards.push(card);
  return { ok: true, value: card };
}

/* ── Scratching ────────────────────────────────────────────────────────── */

/** Fraction of the surface that must be scratched before a card auto-reveals. */
export const REVEAL_THRESHOLD = 0.85;

export function findCard(state: GameState, cardId: string): Card | undefined {
  return state.cards.find((c) => c.id === cardId);
}

/**
 * Advances a card's scratch progress. Used by manual scratching and by the
 * auto-scratcher, so both follow exactly the same reveal model.
 */
export function scratchCard(state: GameState, cardId: string, amount: number): TxResult<Card> {
  const card = findCard(state, cardId);
  if (!card) return fail('not-found');
  if (card.status !== 'unrevealed') return fail('already-resolved');
  card.progress = Math.min(1, Math.max(card.progress, 0) + Math.max(0, amount));
  if (card.progress >= REVEAL_THRESHOLD) {
    card.progress = 1;
    card.status = 'revealed';
  }
  return { ok: true, value: card };
}

/** Accessible full reveal. Identical result and eligibility to manual scratching. */
export function revealCard(state: GameState, cardId: string): TxResult<Card> {
  const card = findCard(state, cardId);
  if (!card) return fail('not-found');
  if (card.status !== 'unrevealed') return fail('already-resolved');
  card.progress = 1;
  card.status = 'revealed';
  return { ok: true, value: card };
}

/* ── Claiming / discarding ─────────────────────────────────────────────── */

export interface ClaimOptions {
  /** Required to claim a negative card. */
  confirmNegative?: boolean;
  auto?: boolean;
}

/** The loss actually applied if a negative card is claimed right now. */
export function cappedLoss(state: GameState, payout: number): number {
  if (payout >= 0) return 0;
  return Math.min(Math.abs(payout), state.cash);
}

export interface ClaimOutcome {
  card: Card;
  /** Signed cash change actually applied. */
  applied: number;
}

export function claimCard(
  state: GameState,
  cardId: string,
  options: ClaimOptions = {},
): TxResult<ClaimOutcome> {
  const card = findCard(state, cardId);
  if (!card) return fail('not-found');
  if (card.status === 'claimed' || card.status === 'discarded') return fail('already-resolved');
  if (card.status === 'unrevealed') return fail('not-revealed');
  if (card.payout < 0 && !options.confirmNegative) {
    card.status = 'held';
    return fail('needs-confirmation');
  }

  let applied: number;
  if (card.payout >= 0) {
    applied = card.payout;
    addCash(state, applied);
    state.runWinnings = clampCurrency(round2(state.runWinnings + applied));
    state.totalWinnings = clampCurrency(round2(state.totalWinnings + applied));
  } else {
    applied = -cappedLoss(state, card.payout);
    addCash(state, applied);
  }

  card.status = 'claimed';
  completeCard(state, card);

  const net = round2(applied - card.cost);
  pushFeed(
    state,
    `${getTicket(card.ticketId).name}: ${formatCash(applied)} claimed (${net >= 0 ? 'profit' : 'loss'} ${formatCash(net)})`,
    applied > 0 ? 'good' : applied < 0 ? 'bad' : 'info',
  );
  return { ok: true, value: { card, applied } };
}

/** Throws a revealed card away. The ticket cost is NOT refunded. */
export function discardCard(state: GameState, cardId: string): TxResult<Card> {
  const card = findCard(state, cardId);
  if (!card) return fail('not-found');
  if (card.status === 'claimed' || card.status === 'discarded') return fail('already-resolved');
  if (card.status === 'unrevealed') return fail('not-revealed');
  card.status = 'discarded';
  completeCard(state, card);
  pushFeed(state, `${getTicket(card.ticketId).name} discarded (cost ${formatCash(card.cost)} not refunded)`, 'info');
  return { ok: true, value: card };
}

function completeCard(state: GameState, card: Card): void {
  state.runCards += 1;
  state.totalCards += 1;
  state.ticketCards[card.ticketId] = (state.ticketCards[card.ticketId] ?? 0) + 1;
  for (const collection of refreshUnlocks(state)) {
    pushFeed(state, `New collection unlocked: ${collection.name}`, 'good');
  }
  pruneCards(state);
}

/** Keeps the resolved-card history bounded so saves stay small. */
export function pruneCards(state: GameState): void {
  const resolved = state.cards.filter((c) => c.status === 'claimed' || c.status === 'discarded');
  if (resolved.length <= 20) return;
  const keep = new Set(resolved.slice(-20).map((c) => c.id));
  state.cards = state.cards.filter(
    (c) => (c.status !== 'claimed' && c.status !== 'discarded') || keep.has(c.id),
  );
}

/* ── Workshop job ──────────────────────────────────────────────────────── */

/** Always-available recovery income. Can never cost the player anything. */
export function workshopJob(state: GameState): TxResult<number> {
  if (state.jobCooldownMs > 0) return fail('cooldown');
  const payout = jobPayout(state);
  addCash(state, payout);
  state.jobCooldownMs = JOB_COOLDOWN_MS;
  return { ok: true, value: payout };
}

/* ── Upgrades ──────────────────────────────────────────────────────────── */

export function runUpgradeCost(state: GameState, id: string): number {
  const def = RUN_UPGRADE_INDEX.get(id);
  if (!def) return Infinity;
  return upgradeCost(def, state.upgrades[id] ?? 0);
}

export function buyRunUpgrade(state: GameState, id: string): TxResult<number> {
  const def = RUN_UPGRADE_INDEX.get(id);
  if (!def) return fail('not-found');
  const level = state.upgrades[id] ?? 0;
  if (level >= def.maxLevel) return fail('max-level');
  const cost = upgradeCost(def, level);
  if (state.cash < cost) return fail('insufficient-funds');
  state.cash = clampCurrency(round2(state.cash - cost));
  state.upgrades[id] = level + 1;
  if (id === 'buyer' || id === 'scratcher' || id === 'collector') {
    const automation = state.automation[id];
    if (automation.status === 'locked') {
      automation.status = 'working';
      automation.enabled = true;
    }
  }
  pushFeed(state, `${def.name} upgraded to level ${level + 1}`, 'info');
  return { ok: true, value: level + 1 };
}

export function canBuyTicketLevel(state: GameState, ticketId: string): TxResult {
  const ticket = getTicket(ticketId);
  const level = ticketLevel(state, ticketId);
  if (level >= TICKET_LEVEL_MAX) return fail('max-level');
  if ((state.ticketCards[ticketId] ?? 0) < ticketLevelRequirement(level)) {
    return fail('requirement-not-met');
  }
  if (state.cash < ticketLevelCost(ticket.cost, level)) return fail('insufficient-funds');
  return { ok: true };
}

export function buyTicketLevel(state: GameState, ticketId: string): TxResult<number> {
  const check = canBuyTicketLevel(state, ticketId);
  if (!check.ok) return check as TxResult<never>;
  const ticket = getTicket(ticketId);
  const level = ticketLevel(state, ticketId);
  state.cash = clampCurrency(round2(state.cash - ticketLevelCost(ticket.cost, level)));
  state.ticketLevels[ticketId] = level + 1;
  pushFeed(state, `${ticket.name} upgraded to level ${level + 1}`, 'info');
  return { ok: true, value: level + 1 };
}
