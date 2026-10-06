import type { GameState } from '../types';

/**
 * ───────────────────────────────────────────────────────────────────────────
 *  BALANCING CONFIGURATION — UPGRADES, AUTOMATION AND PRESTIGE
 * ───────────────────────────────────────────────────────────────────────────
 * All pacing knobs live here. `scripts/simulate.ts` reads the same numbers, so
 * changing a value here changes both the game and the balance report.
 */

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  baseCost: number;
  /** Cost multiplier per level. cost(level) = baseCost × growth^level. */
  growth: number;
  maxLevel: number;
  category: 'luck' | 'capacity' | 'automation' | 'workshop';
  /** Human readable description of what the next level does. */
  effect: (level: number) => string;
}

export const RUN_UPGRADES: UpgradeDef[] = [
  {
    id: 'luck',
    name: 'Lucky Polish',
    description:
      'Shifts symbol weights toward rewarding symbols. Each ticket has its own luck cap.',
    baseCost: 11,
    growth: 1.6,
    maxLevel: 30,
    category: 'luck',
    effect: (level) => `Global luck level ${level} → ${level + 1}`,
  },
  {
    id: 'rack',
    name: 'Card Rack',
    description: 'Adds a slot for unclaimed cards. The auto-buyer never exceeds this capacity.',
    baseCost: 120,
    growth: 1.8,
    maxLevel: 12,
    category: 'capacity',
    effect: (level) => `Queue capacity ${3 + 2 * level} → ${5 + 2 * level} cards`,
  },
  {
    id: 'job',
    name: 'Workshop Training',
    description: 'Increases the payout of the always-available Workshop job.',
    baseCost: 120,
    growth: 2.2,
    maxLevel: 10,
    category: 'workshop',
    effect: (level) => `Job payout ×${(1 + 0.5 * level).toFixed(1)} → ×${(1.5 + 0.5 * level).toFixed(1)}`,
  },
  {
    id: 'buyer',
    name: 'Auto-Buyer Arm',
    description: 'A mechanical arm that buys your selected ticket on a timer.',
    baseCost: 120,
    growth: 2.0,
    maxLevel: 15,
    category: 'automation',
    effect: (level) =>
      level === 0
        ? 'Unlocks the Auto-Buyer (one card every 3.0s)'
        : `Buy interval ${(buyerInterval(level) / 1000).toFixed(2)}s → ${(buyerInterval(level + 1) / 1000).toFixed(2)}s`,
  },
  {
    id: 'scratcher',
    name: 'Scratcher Drum',
    description: 'A rotating drum that scratches queued cards for you.',
    baseCost: 55,
    growth: 2.0,
    maxLevel: 15,
    category: 'automation',
    effect: (level) =>
      level === 0
        ? 'Unlocks the Auto-Scratcher (0.80 cards/s, 1 at a time)'
        : `Scratch speed ${scratchRate(level).toFixed(2)} → ${scratchRate(level + 1).toFixed(2)} cards/s, ` +
          `capacity ${scratcherCapacity(level)} → ${scratcherCapacity(level + 1)}`,
  },
  {
    id: 'collector',
    name: 'Collector Chute',
    description: 'Claims fully revealed cards for you. Risky cards follow your safety settings.',
    baseCost: 400,
    growth: 2.0,
    maxLevel: 15,
    category: 'automation',
    effect: (level) =>
      level === 0
        ? 'Unlocks the Collector (one card every 2.5s)'
        : `Collect interval ${(collectorInterval(level) / 1000).toFixed(2)}s → ${(collectorInterval(level + 1) / 1000).toFixed(2)}s`,
  },
];

export const RUN_UPGRADE_INDEX = new Map(RUN_UPGRADES.map((u) => [u.id, u]));

export function upgradeCost(def: UpgradeDef, level: number): number {
  return Math.ceil(def.baseCost * Math.pow(def.growth, level));
}

/* ── Automation timing curves ──────────────────────────────────────────── */

/** Milliseconds between auto purchases at a given Auto-Buyer level (≥1). */
export function buyerInterval(level: number): number {
  if (level <= 0) return Infinity;
  return Math.max(150, 3000 * Math.pow(0.78, level - 1));
}

/** Card progress per second for one scratcher head. */
export function scratchRate(level: number): number {
  if (level <= 0) return 0;
  return 0.8 + 0.25 * (level - 1);
}

/** How many queued cards the scratcher works on simultaneously. */
export function scratcherCapacity(level: number): number {
  if (level <= 0) return 0;
  return 1 + Math.floor((level - 1) / 3);
}

/** Milliseconds between collector actions. */
export function collectorInterval(level: number): number {
  if (level <= 0) return Infinity;
  return Math.max(120, 2500 * Math.pow(0.78, level - 1));
}

/* ── Ticket levels ─────────────────────────────────────────────────────── */

/** Payout bonus per ticket level. */
export const TICKET_LEVEL_BONUS = 0.06;
export const TICKET_LEVEL_MAX = 10;

/** Cards of that ticket that must be completed before the next level unlocks. */
export function ticketLevelRequirement(level: number): number {
  return 10 * (level + 1);
}

export function ticketLevelCost(ticketCost: number, level: number): number {
  return Math.ceil(ticketCost * 30 * Math.pow(2.1, level));
}

/* ── Workshop job (bankruptcy protection) ──────────────────────────────── */

export const JOB_COOLDOWN_MS = 2500;

/* ── Prestige ──────────────────────────────────────────────────────────── */

export interface PermanentUpgradeDef {
  id: string;
  name: string;
  description: string;
  baseCost: number;
  growth: number;
  maxLevel: number;
  effect: (level: number) => string;
}

export const PERMANENT_UPGRADES: PermanentUpgradeDef[] = [
  {
    id: 'capital',
    name: 'Starting Capital',
    description: 'Begin every run with more Workshop Credits.',
    baseCost: 2,
    growth: 2.1,
    maxLevel: 10,
    effect: (level) => `Start with ¤${startingCash(level)} → ¤${startingCash(level + 1)}`,
  },
  {
    id: 'starterKit',
    name: 'Automation Starter Kit',
    description: 'Begin each run with automation already installed.',
    baseCost: 6,
    growth: 3,
    maxLevel: 3,
    effect: (level) =>
      ['Start with the Auto-Buyer', 'Also start with the Scratcher', 'Also start with the Collector'][
        Math.min(level, 2)
      ],
  },
  {
    id: 'fasterScratcher',
    name: 'Faster Scratcher',
    description: 'Permanently speeds up the Scratcher Drum.',
    baseCost: 4,
    growth: 2,
    maxLevel: 10,
    effect: (level) => `Scratch speed ×${(1 + 0.3 * level).toFixed(1)} → ×${(1 + 0.3 * (level + 1)).toFixed(1)}`,
  },
  {
    id: 'queueCapacity',
    name: 'Workshop Shelving',
    description: 'Permanently increases card queue capacity.',
    baseCost: 3,
    growth: 1.9,
    maxLevel: 10,
    effect: (level) => `+${2 * level} → +${2 * (level + 1)} queue slots`,
  },
  {
    id: 'blueprintBoost',
    name: 'Draughting Table',
    description: 'Earn more Blueprints from every prestige.',
    baseCost: 5,
    growth: 2.2,
    maxLevel: 10,
    effect: (level) => `Blueprint gain ×${(1 + 0.25 * level).toFixed(2)} → ×${(1 + 0.25 * (level + 1)).toFixed(2)}`,
  },
  {
    id: 'carefulCollector',
    name: 'Careful Collector',
    description:
      'The Collector automatically discards negative cards instead of holding them. It does NOT refund ticket costs and does not guarantee profit.',
    baseCost: 10,
    growth: 1,
    maxLevel: 1,
    effect: () => 'Collector discards negative-value cards automatically',
  },
];

export const PERMANENT_UPGRADE_INDEX = new Map(PERMANENT_UPGRADES.map((u) => [u.id, u]));

export function permanentCost(def: PermanentUpgradeDef, level: number): number {
  return Math.ceil(def.baseCost * Math.pow(def.growth, level));
}

export function startingCash(capitalLevel: number): number {
  return 10 * (1 + 3 * capitalLevel);
}

/** Gross winnings in a run required before prestige becomes available. */
export const PRESTIGE_REQUIREMENT = 17000000;

/** Divisor in the Blueprint award formula. */
export const BLUEPRINT_DIVISOR = 1500000;

/** Blueprints that would be awarded for prestiging right now. */
export function blueprintAward(state: GameState): number {
  if (state.runWinnings < PRESTIGE_REQUIREMENT) return 0;
  const boost = 1 + 0.25 * (state.permanent.blueprintBoost ?? 0);
  return Math.max(1, Math.floor(Math.sqrt(state.runWinnings / BLUEPRINT_DIVISOR) * boost));
}

/* ── Offline progress ──────────────────────────────────────────────────── */

/** Offline progress is credited for at most two hours. */
export const OFFLINE_CAP_MS = 2 * 60 * 60 * 1000;
/** Fixed step used by the bounded offline catch-up simulation. */
export const OFFLINE_STEP_MS = 250;
