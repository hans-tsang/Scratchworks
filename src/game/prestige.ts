import {
  PERMANENT_UPGRADE_INDEX,
  PRESTIGE_REQUIREMENT,
  blueprintAward,
  permanentCost,
} from './data/upgrades';
import { createInitialState } from './state';
import type { GameState } from './types';

/**
 * ───────────────────────────────────────────────────────────────────────────
 *  PRESTIGE — "Blueprints"
 * ───────────────────────────────────────────────────────────────────────────
 * Prestiging files your run away as a set of Blueprints: a permanent currency
 * spent on upgrades that persist across runs.
 */

export interface PrestigePreview {
  requirement: number;
  progress: number;
  available: boolean;
  /** Blueprints that WOULD be awarded now — not yet spendable. */
  pendingAward: number;
  /** Blueprints currently owned and spendable. */
  owned: number;
  resets: string[];
  keeps: string[];
}

export function canPrestige(state: GameState): boolean {
  return state.runWinnings >= PRESTIGE_REQUIREMENT;
}

export function prestigePreview(state: GameState): PrestigePreview {
  return {
    requirement: PRESTIGE_REQUIREMENT,
    progress: Math.min(1, state.runWinnings / PRESTIGE_REQUIREMENT),
    available: canPrestige(state),
    pendingAward: blueprintAward(state),
    owned: state.blueprints,
    resets: [
      'Workshop Credits on hand',
      'All cards in the queue (unclaimed cards are lost)',
      'Run upgrades: luck, rack, automation and ticket levels',
      'Collection unlocks and run winnings',
    ],
    keeps: [
      'Blueprints and every permanent upgrade',
      'All-time winnings and cards completed',
      'Settings, including safety and automation preferences',
    ],
  };
}

/**
 * Performs a prestige. Returns the new run state.
 * The caller is responsible for confirming with the player first.
 */
export function prestige(state: GameState, now = Date.now()): GameState {
  if (!canPrestige(state)) return state;
  const award = blueprintAward(state);
  const next = createInitialState({
    now,
    seed: state.rngState,
    blueprints: state.blueprints + award,
    lifetimeBlueprints: state.lifetimeBlueprints + award,
    permanent: { ...state.permanent },
    settings: { ...state.settings },
    totalWinnings: state.totalWinnings,
    totalCards: state.totalCards,
    prestigeCount: state.prestigeCount + 1,
    playTimeMs: state.playTimeMs,
  });
  next.feed = [
    {
      id: 1,
      text: `Filed ${award} Blueprint${award === 1 ? '' : 's'} and reopened the workshop.`,
      tone: 'good',
      at: now,
    },
  ];
  next.nextFeedId = 2;
  return next;
}

export function permanentUpgradeCost(state: GameState, id: string): number {
  const def = PERMANENT_UPGRADE_INDEX.get(id);
  if (!def) return Infinity;
  return permanentCost(def, state.permanent[id] ?? 0);
}

export interface PermanentPurchaseResult {
  ok: boolean;
  reason?: 'not-found' | 'max-level' | 'insufficient-blueprints';
}

/** Blueprints may only be spent on the prestige screen. */
export function buyPermanentUpgrade(state: GameState, id: string): PermanentPurchaseResult {
  const def = PERMANENT_UPGRADE_INDEX.get(id);
  if (!def) return { ok: false, reason: 'not-found' };
  const level = state.permanent[id] ?? 0;
  if (level >= def.maxLevel) return { ok: false, reason: 'max-level' };
  const cost = permanentCost(def, level);
  if (state.blueprints < cost) return { ok: false, reason: 'insufficient-blueprints' };
  state.blueprints -= cost;
  state.permanent[id] = level + 1;
  return { ok: true };
}
