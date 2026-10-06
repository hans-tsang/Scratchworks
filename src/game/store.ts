import { useSyncExternalStore } from 'react';
import { applyOffline, tick } from './automation';
import {
  buyCard,
  buyRunUpgrade,
  buyTicketLevel,
  claimCard,
  discardCard,
  pushFeed,
  revealCard,
  scratchCard,
  workshopJob,
  type TxResult,
} from './economy';
import { prestige as doPrestige, buyPermanentUpgrade } from './prestige';
import { clearStorage, importSave, loadFromStorage, saveToStorage, serialize } from './save';
import { createInitialState } from './state';
import type { GameState, OfflineReport, Settings } from './types';

/**
 * Mutable store with a revision counter. The game state is large and ticks
 * frequently, so it is mutated in place and components subscribe to a cheap
 * revision number instead of deep-cloning the world 10 times a second.
 */

const TICK_MS = 100;
const AUTOSAVE_MS = 10000;

type Listener = () => void;

class GameStore {
  state: GameState;
  revision = 0;
  offlineReport?: OfflineReport;
  notice?: string;
  private listeners = new Set<Listener>();
  private timer?: ReturnType<typeof setInterval>;
  private lastSave = 0;
  private saveFailed = false;

  constructor() {
    const loaded = loadFromStorage();
    this.state = loaded.state;
    if (loaded.status === 'corrupt' || loaded.status === 'unavailable') {
      this.notice = loaded.message;
    } else if (loaded.status === 'repaired') {
      this.notice = 'Part of your save could not be read and was repaired.';
    }
    if (loaded.status === 'ok' || loaded.status === 'repaired') {
      const report = applyOffline(this.state, Date.now());
      if (report.creditedMs > 1000 && (report.cashGained !== 0 || report.cardsClaimed > 0)) {
        this.offlineReport = report;
      }
    }
    this.state.lastTickAt = Date.now();
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): number => this.revision;

  notify(): void {
    this.revision++;
    for (const listener of this.listeners) listener();
  }

  start(): void {
    if (this.timer) return;
    this.state.lastTickAt = Date.now();
    this.timer = setInterval(() => this.step(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private step(): void {
    const now = Date.now();
    const dt = Math.max(0, Math.min(now - this.state.lastTickAt, 60000));
    this.state.lastTickAt = now;
    tick(this.state, dt);
    if (now - this.lastSave > AUTOSAVE_MS) this.save();
    this.notify();
  }

  save(): void {
    this.lastSave = Date.now();
    const result = saveToStorage(this.state);
    if (!result.ok && !this.saveFailed) {
      this.saveFailed = true;
      this.notice = result.message;
    }
  }

  /** Runs a mutation, then saves and notifies. */
  act<T>(mutation: (state: GameState) => T): T {
    const result = mutation(this.state);
    this.save();
    this.notify();
    return result;
  }

  dismissOffline(): void {
    this.offlineReport = undefined;
    this.notify();
  }

  dismissNotice(): void {
    this.notice = undefined;
    this.notify();
  }

  /* ── Player actions ──────────────────────────────────────────────── */

  buy(ticketId: string) {
    return this.act((s) => buyCard(s, ticketId));
  }

  scratch(cardId: string, amount: number) {
    return this.act((s) => scratchCard(s, cardId, amount));
  }

  reveal(cardId: string) {
    return this.act((s) => revealCard(s, cardId));
  }

  claim(cardId: string, confirmNegative = false): TxResult<unknown> {
    return this.act((s) => claimCard(s, cardId, { confirmNegative }));
  }

  discard(cardId: string) {
    return this.act((s) => discardCard(s, cardId));
  }

  job() {
    return this.act((s) => workshopJob(s));
  }

  upgrade(id: string) {
    return this.act((s) => buyRunUpgrade(s, id));
  }

  ticketLevel(ticketId: string) {
    return this.act((s) => buyTicketLevel(s, ticketId));
  }

  select(ticketId: string) {
    this.act((s) => {
      s.selectedTicketId = ticketId;
    });
  }

  toggleAutomation(id: 'buyer' | 'scratcher' | 'collector') {
    this.act((s) => {
      const device = s.automation[id];
      if ((s.upgrades[id] ?? 0) <= 0) return;
      device.enabled = !device.enabled;
      device.status = device.enabled ? 'working' : 'off';
    });
  }

  updateSettings(patch: Partial<Settings>) {
    this.act((s) => {
      s.settings = { ...s.settings, ...patch };
    });
  }

  prestige() {
    this.state = doPrestige(this.state, Date.now());
    this.save();
    this.notify();
  }

  buyPermanent(id: string) {
    return this.act((s) => buyPermanentUpgrade(s, id));
  }

  exportSave(): string {
    return serialize(this.state);
  }

  importSave(text: string): boolean {
    const result = importSave(text);
    if (result.status === 'corrupt') {
      this.notice = result.message;
      this.notify();
      return false;
    }
    this.state = result.state;
    this.state.lastTickAt = Date.now();
    pushFeed(this.state, 'Save imported.', 'info');
    this.save();
    this.notify();
    return true;
  }

  resetSave(): void {
    clearStorage();
    this.state = createInitialState();
    this.save();
    this.notify();
  }
}

export const store = new GameStore();

/** Subscribes a component to every state change. */
export function useGame(): GameState {
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return store.state;
}
