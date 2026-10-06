import { clampCurrency, round2 } from './format';
import { findTicket, COLLECTIONS, DEFAULT_TICKET_ID } from './data/tickets';
import { DEFAULT_SETTINGS, SAVE_VERSION, createInitialState } from './state';
import type { AutomationState, Card, CardStatus, GameState, Settings } from './types';

/**
 * ───────────────────────────────────────────────────────────────────────────
 *  SAVE / LOAD
 * ───────────────────────────────────────────────────────────────────────────
 * Saves are plain JSON with a schema version. Loading never trusts the data:
 * every field is validated and coerced, unknown tickets are dropped and a
 * hopeless save falls back to a fresh run rather than crashing the game.
 */

export const STORAGE_KEY = 'scratchworks.save.v1';

export interface LoadResult {
  state: GameState;
  /** 'ok' | 'empty' | 'repaired' | 'corrupt' | 'unavailable' */
  status: 'ok' | 'empty' | 'repaired' | 'corrupt' | 'unavailable';
  message?: string;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function levelRecord(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (value && typeof value === 'object') {
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const n = num(raw, 0);
      if (n > 0) out[key] = Math.floor(n);
    }
  }
  return out;
}

const CARD_STATUSES: CardStatus[] = ['unrevealed', 'revealed', 'held', 'claimed', 'discarded'];

function sanitizeCard(raw: unknown, index: number): Card | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const ticket = typeof r.ticketId === 'string' ? findTicket(r.ticketId) : undefined;
  if (!ticket) return undefined;
  const cells = Array.isArray(r.cells)
    ? r.cells.filter((c): c is string => typeof c === 'string')
    : [];
  if (cells.length !== ticket.cells) return undefined;
  if (!cells.every((id) => ticket.symbols.some((s) => s.id === id))) return undefined;
  const status = CARD_STATUSES.includes(r.status as CardStatus)
    ? (r.status as CardStatus)
    : 'unrevealed';
  return {
    id: typeof r.id === 'string' ? r.id : `c${index}`,
    ticketId: ticket.id,
    cells,
    payout: clampCurrency(round2(num(r.payout, 0))),
    cost: clampCurrency(round2(num(r.cost, ticket.cost))),
    progress: Math.min(1, Math.max(0, num(r.progress, status === 'unrevealed' ? 0 : 1))),
    status,
    purchasedAt: num(r.purchasedAt, Date.now()),
    auto: bool(r.auto, false),
  };
}

function sanitizeAutomation(raw: unknown): AutomationState {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    enabled: bool(r.enabled, false),
    accumulatorMs: Math.max(0, num(r.accumulatorMs, 0)),
    status: 'locked',
  };
}

function sanitizeSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    reducedMotion: bool(r.reducedMotion, DEFAULT_SETTINGS.reducedMotion),
    muted: bool(r.muted, DEFAULT_SETTINGS.muted),
    bigSpendWarning: bool(r.bigSpendWarning, DEFAULT_SETTINGS.bigSpendWarning),
    autoClaimRisky: bool(r.autoClaimRisky, DEFAULT_SETTINGS.autoClaimRisky),
    reserveCash: Math.max(0, num(r.reserveCash, DEFAULT_SETTINGS.reserveCash)),
    autoBuyQueueLimit: Math.max(1, Math.floor(num(r.autoBuyQueueLimit, DEFAULT_SETTINGS.autoBuyQueueLimit))),
    onboardingDismissed: bool(r.onboardingDismissed, DEFAULT_SETTINGS.onboardingDismissed),
  };
}

/** Migrates older schema versions forward. */
export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  const version = num(raw.version, 0);
  const data = { ...raw };
  if (version < 1) {
    // v0 (pre-release) saves had no automation block.
    data.version = 1;
  }
  return data;
}

/** Validates and repairs arbitrary data into a usable game state. */
export function deserialize(raw: unknown): LoadResult {
  if (!raw || typeof raw !== 'object') {
    return { state: createInitialState(), status: 'corrupt', message: 'Save was not an object.' };
  }
  const data = migrate(raw as Record<string, unknown>);
  let repaired = false;

  const base = createInitialState({ now: num(data.lastTickAt, Date.now()) });
  const cardsRaw = Array.isArray(data.cards) ? data.cards : [];
  const cards: Card[] = [];
  for (let i = 0; i < cardsRaw.length; i++) {
    const card = sanitizeCard(cardsRaw[i], i);
    if (card) cards.push(card);
    else repaired = true;
  }

  const unlocked = Array.isArray(data.unlockedCollections)
    ? data.unlockedCollections.filter(
        (id): id is string => typeof id === 'string' && COLLECTIONS.some((c) => c.id === id),
      )
    : [];
  if (!unlocked.includes(COLLECTIONS[0].id)) unlocked.unshift(COLLECTIONS[0].id);

  const selected =
    typeof data.selectedTicketId === 'string' && findTicket(data.selectedTicketId)
      ? data.selectedTicketId
      : DEFAULT_TICKET_ID;
  if (selected !== data.selectedTicketId) repaired = true;

  const automationRaw = (data.automation ?? {}) as Record<string, unknown>;
  const state: GameState = {
    ...base,
    version: SAVE_VERSION,
    cash: Math.max(0, clampCurrency(round2(num(data.cash, base.cash)))),
    runWinnings: Math.max(0, clampCurrency(round2(num(data.runWinnings, 0)))),
    totalWinnings: Math.max(0, clampCurrency(round2(num(data.totalWinnings, 0)))),
    runCards: Math.max(0, Math.floor(num(data.runCards, 0))),
    totalCards: Math.max(0, Math.floor(num(data.totalCards, 0))),
    ticketCards: levelRecord(data.ticketCards),
    cards,
    nextCardId: Math.max(1, Math.floor(num(data.nextCardId, cards.length + 1))),
    selectedTicketId: selected,
    upgrades: levelRecord(data.upgrades),
    ticketLevels: levelRecord(data.ticketLevels),
    unlockedCollections: unlocked,
    automation: {
      buyer: sanitizeAutomation(automationRaw.buyer),
      scratcher: sanitizeAutomation(automationRaw.scratcher),
      collector: sanitizeAutomation(automationRaw.collector),
    },
    blueprints: Math.max(0, Math.floor(num(data.blueprints, 0))),
    lifetimeBlueprints: Math.max(0, Math.floor(num(data.lifetimeBlueprints, 0))),
    permanent: levelRecord(data.permanent),
    prestigeCount: Math.max(0, Math.floor(num(data.prestigeCount, 0))),
    settings: sanitizeSettings(data.settings),
    jobCooldownMs: Math.max(0, num(data.jobCooldownMs, 0)),
    lastTickAt: num(data.lastTickAt, Date.now()),
    runStartedAt: num(data.runStartedAt, Date.now()),
    playTimeMs: Math.max(0, num(data.playTimeMs, 0)),
    rngState: Math.floor(num(data.rngState, base.rngState)) >>> 0,
    feed: [],
    nextFeedId: 1,
  };

  return { state, status: repaired ? 'repaired' : 'ok' };
}

/** Serialises the state. Transient fields (feed, statuses) are not stored. */
export function serialize(state: GameState): string {
  const { feed: _feed, nextFeedId: _nextFeedId, ...rest } = state;
  return JSON.stringify({ ...rest, version: SAVE_VERSION });
}

/* ── localStorage access (always defensive) ────────────────────────────── */

function storage(): Storage | undefined {
  try {
    if (typeof localStorage === 'undefined') return undefined;
    const probe = '__scratchworks_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return undefined;
  }
}

export function saveToStorage(state: GameState): { ok: boolean; message?: string } {
  const store = storage();
  if (!store) return { ok: false, message: 'Local storage is unavailable; progress is not saved.' };
  try {
    store.setItem(STORAGE_KEY, serialize(state));
    return { ok: true };
  } catch {
    return { ok: false, message: 'Could not write the save (storage may be full).' };
  }
}

export function loadFromStorage(): LoadResult {
  const store = storage();
  if (!store) {
    return {
      state: createInitialState(),
      status: 'unavailable',
      message: 'Local storage is unavailable; this session will not be saved.',
    };
  }
  let raw: string | null = null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return { state: createInitialState(), status: 'unavailable' };
  }
  if (!raw) return { state: createInitialState(), status: 'empty' };
  try {
    return deserialize(JSON.parse(raw));
  } catch {
    return {
      state: createInitialState(),
      status: 'corrupt',
      message: 'The stored save could not be read, so a new workshop was opened.',
    };
  }
}

export function clearStorage(): void {
  const store = storage();
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Import a save exported by the player; returns a validated result. */
export function importSave(text: string): LoadResult {
  try {
    return deserialize(JSON.parse(text));
  } catch {
    return {
      state: createInitialState(),
      status: 'corrupt',
      message: 'That file is not valid Scratchworks save JSON.',
    };
  }
}
