/** Shared type definitions for Scratchworks. */

export type TicketKind = 'match3' | 'trail' | 'garden';

/** How a symbol reacts to luck. Weight is multiplied by (1 + step)^affinity. */
export type LuckAffinity = -1 | 0 | 1;

export interface SymbolDef {
  id: string;
  label: string;
  /** Short original glyph drawn on the card face. */
  glyph: string;
  /** Base relative weight. Probabilities are weight / sum(weights). */
  weight: number;
  luckAffinity: LuckAffinity;
  /**
   * Meaning depends on the ticket kind:
   *  - match3: payout multiple of the ticket cost for a group of exactly three.
   *  - trail: for `role: 'coin'` the coin value as a multiple of ticket cost,
   *           for `role: 'mult'` the multiplier applied to the whole trail.
   *  - garden: signed value as a multiple of the ticket cost.
   */
  value: number;
  role: 'blank' | 'match' | 'coin' | 'mult' | 'reward' | 'pest';
  /** Marks the headline jackpot symbol, for display only. */
  jackpot?: boolean;
  description: string;
}

export interface TicketDef {
  id: string;
  name: string;
  kind: TicketKind;
  collectionId: string;
  /** Purchase price in Workshop Credits. */
  cost: number;
  /** Number of scratchable spaces on the card. */
  cells: number;
  symbols: SymbolDef[];
  /** Luck levels beyond this value have no effect on this ticket. */
  luckCap: number;
  /** True for tickets that can produce a negative result. */
  risky: boolean;
  rules: string[];
}

export interface CollectionDef {
  id: string;
  name: string;
  tagline: string;
  /** Lifetime gross winnings (this run) needed to unlock. 0 = available immediately. */
  unlockWinnings: number;
  /** Cards completed (this run) needed to unlock. */
  unlockCards: number;
  accent: string;
}

export type CardStatus =
  | 'unrevealed'
  | 'revealed'
  /** Fully revealed negative card parked for explicit player review. */
  | 'held'
  | 'claimed'
  | 'discarded';

export interface Card {
  id: string;
  ticketId: string;
  /** Symbol ids, one per cell — the single source of truth for the outcome. */
  cells: string[];
  /** Gross payout derived from `cells` at purchase time. May be negative. */
  payout: number;
  /** Ticket cost actually paid, stored so profit stays correct after upgrades. */
  cost: number;
  /** 0..1 scratched fraction. */
  progress: number;
  status: CardStatus;
  purchasedAt: number;
  /** True when bought by the auto-buyer. */
  auto: boolean;
}

export type AutomationId = 'buyer' | 'scratcher' | 'collector';

export type AutomationStatus =
  | 'locked'
  | 'off'
  | 'working'
  | 'waiting-cash'
  | 'queue-full'
  | 'waiting-card'
  | 'reserve-reached'
  | 'holding-risky';

export interface AutomationState {
  enabled: boolean;
  accumulatorMs: number;
  status: AutomationStatus;
}

export interface Settings {
  reducedMotion: boolean;
  muted: boolean;
  /** Warn when a manual purchase costs more than 25% of cash. */
  bigSpendWarning: boolean;
  /** Allow the collector to claim negative cards automatically. */
  autoClaimRisky: boolean;
  /** Auto-buyer keeps at least this much cash untouched. */
  reserveCash: number;
  /** Maximum number of unclaimed cards the buyer may create. */
  autoBuyQueueLimit: number;
  onboardingDismissed: boolean;
}

export interface FeedEntry {
  id: number;
  text: string;
  tone: 'good' | 'bad' | 'info';
  at: number;
}

export interface GameState {
  version: number;
  /** Spendable money. Never negative. */
  cash: number;
  /** Gross winnings claimed during the current run (reset by prestige). */
  runWinnings: number;
  /** Gross winnings claimed across all runs (never reset). */
  totalWinnings: number;
  /** Cards fully resolved (claimed or discarded) during the current run. */
  runCards: number;
  totalCards: number;
  /** Cards completed per ticket id, used for ticket level milestones. */
  ticketCards: Record<string, number>;

  cards: Card[];
  nextCardId: number;
  selectedTicketId: string;

  /** Run upgrade levels keyed by upgrade id. */
  upgrades: Record<string, number>;
  /** Per ticket payout levels. */
  ticketLevels: Record<string, number>;
  unlockedCollections: string[];

  automation: Record<AutomationId, AutomationState>;

  blueprints: number;
  /** Blueprints banked from previous prestiges (display helper). */
  lifetimeBlueprints: number;
  permanent: Record<string, number>;
  prestigeCount: number;

  settings: Settings;

  /** Workshop job cooldown remaining, in milliseconds. */
  jobCooldownMs: number;
  /** Wall clock time of the last simulated tick. */
  lastTickAt: number;
  runStartedAt: number;
  playTimeMs: number;
  rngState: number;

  feed: FeedEntry[];
  nextFeedId: number;
}

export interface OfflineReport {
  elapsedMs: number;
  creditedMs: number;
  cashGained: number;
  cardsBought: number;
  cardsClaimed: number;
}
