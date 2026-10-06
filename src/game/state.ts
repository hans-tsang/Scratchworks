import { COLLECTIONS, DEFAULT_TICKET_ID, TICKETS, findTicket } from './data/tickets';
import {
  JOB_COOLDOWN_MS,
  TICKET_LEVEL_BONUS,
  startingCash,
} from './data/upgrades';
import type { CollectionDef, GameState, Settings, TicketDef } from './types';

export const SAVE_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  reducedMotion: false,
  muted: false,
  bigSpendWarning: true,
  autoClaimRisky: false,
  reserveCash: 0,
  autoBuyQueueLimit: 12,
  onboardingDismissed: false,
};

export interface NewRunOptions {
  now?: number;
  seed?: number;
  blueprints?: number;
  lifetimeBlueprints?: number;
  permanent?: Record<string, number>;
  settings?: Settings;
  totalWinnings?: number;
  totalCards?: number;
  prestigeCount?: number;
  playTimeMs?: number;
}

/** Creates a fresh run. Permanent upgrades, settings and Blueprints carry over. */
export function createInitialState(options: NewRunOptions = {}): GameState {
  const now = options.now ?? Date.now();
  const permanent = { ...(options.permanent ?? {}) };
  const starterKit = permanent.starterKit ?? 0;
  const upgrades: Record<string, number> = {};
  if (starterKit >= 1) upgrades.buyer = 1;
  if (starterKit >= 2) upgrades.scratcher = 1;
  if (starterKit >= 3) upgrades.collector = 1;

  return {
    version: SAVE_VERSION,
    cash: startingCash(permanent.capital ?? 0),
    runWinnings: 0,
    totalWinnings: options.totalWinnings ?? 0,
    runCards: 0,
    totalCards: options.totalCards ?? 0,
    ticketCards: {},
    cards: [],
    nextCardId: 1,
    selectedTicketId: DEFAULT_TICKET_ID,
    upgrades,
    ticketLevels: {},
    unlockedCollections: [COLLECTIONS[0].id],
    automation: {
      buyer: { enabled: starterKit >= 1, accumulatorMs: 0, status: starterKit >= 1 ? 'working' : 'locked' },
      scratcher: {
        enabled: starterKit >= 2,
        accumulatorMs: 0,
        status: starterKit >= 2 ? 'working' : 'locked',
      },
      collector: {
        enabled: starterKit >= 3,
        accumulatorMs: 0,
        status: starterKit >= 3 ? 'working' : 'locked',
      },
    },
    blueprints: options.blueprints ?? 0,
    lifetimeBlueprints: options.lifetimeBlueprints ?? 0,
    permanent,
    prestigeCount: options.prestigeCount ?? 0,
    settings: { ...DEFAULT_SETTINGS, ...(options.settings ?? {}) },
    jobCooldownMs: 0,
    lastTickAt: now,
    runStartedAt: now,
    playTimeMs: options.playTimeMs ?? 0,
    rngState: options.seed ?? (now ^ 0x5f3759df) >>> 0,
    feed: [],
    nextFeedId: 1,
  };
}

/* ── Derived values ────────────────────────────────────────────────────── */

export function globalLuck(state: GameState): number {
  return state.upgrades.luck ?? 0;
}

export function ticketLevel(state: GameState, ticketId: string): number {
  return state.ticketLevels[ticketId] ?? 0;
}

/** Payout multiplier from ticket levels; applied to positive payouts only. */
export function ticketLevelMultiplier(state: GameState, ticketId: string): number {
  return 1 + TICKET_LEVEL_BONUS * ticketLevel(state, ticketId);
}

export function queueCapacity(state: GameState): number {
  return 3 + 2 * (state.upgrades.rack ?? 0) + 2 * (state.permanent.queueCapacity ?? 0);
}

/** Cards that still occupy a queue slot. */
export function activeCards(state: GameState) {
  return state.cards.filter(
    (c) => c.status === 'unrevealed' || c.status === 'revealed' || c.status === 'held',
  );
}

export function queueUsed(state: GameState): number {
  return activeCards(state).length;
}

/** The Workshop job always pays enough to buy back into the cheapest ticket. */
export function jobPayout(state: GameState): number {
  const unlocked = state.unlockedCollections;
  let cheapestOfBest = TICKETS[0].cost;
  for (const collection of COLLECTIONS) {
    if (!unlocked.includes(collection.id)) continue;
    const costs = TICKETS.filter((t) => t.collectionId === collection.id).map((t) => t.cost);
    cheapestOfBest = Math.max(cheapestOfBest, Math.min(...costs));
  }
  const training = 1 + 0.5 * (state.upgrades.job ?? 0);
  return Math.max(2, Math.round(cheapestOfBest * 0.75 * training * 100) / 100);
}

export function jobReady(state: GameState): boolean {
  return state.jobCooldownMs <= 0;
}

export const JOB_COOLDOWN = JOB_COOLDOWN_MS;

export function isCollectionUnlocked(state: GameState, collectionId: string): boolean {
  return state.unlockedCollections.includes(collectionId);
}

export function availableTickets(state: GameState): TicketDef[] {
  return TICKETS.filter((t) => isCollectionUnlocked(state, t.collectionId));
}

/** The next collection that is still locked, if any. */
export function nextLockedCollection(state: GameState): CollectionDef | undefined {
  return COLLECTIONS.find((c) => !state.unlockedCollections.includes(c.id));
}

/**
 * Unlocks every collection whose milestone has been met.
 * A collection unlocks when EITHER the gross winnings OR the cards-completed
 * milestone for this run is reached.
 */
export function refreshUnlocks(state: GameState): CollectionDef[] {
  const newly: CollectionDef[] = [];
  for (const collection of COLLECTIONS) {
    if (state.unlockedCollections.includes(collection.id)) continue;
    if (state.runWinnings >= collection.unlockWinnings || state.runCards >= collection.unlockCards) {
      state.unlockedCollections.push(collection.id);
      newly.push(collection);
    }
  }
  return newly;
}

export function selectedTicket(state: GameState): TicketDef {
  return findTicket(state.selectedTicketId) ?? TICKETS[0];
}
