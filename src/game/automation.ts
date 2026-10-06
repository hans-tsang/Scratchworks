import { buyCard, claimCard, discardCard, scratchCard, type BuyOptions } from './economy';
import {
  OFFLINE_CAP_MS,
  OFFLINE_STEP_MS,
  buyerInterval,
  collectorInterval,
  scratchRate,
  scratcherCapacity,
} from './data/upgrades';
import { findTicket } from './data/tickets';
import { queueCapacity } from './state';
import type { AutomationStatus, GameState, OfflineReport } from './types';

/**
 * ───────────────────────────────────────────────────────────────────────────
 *  AUTOMATION SIMULATION
 * ───────────────────────────────────────────────────────────────────────────
 * One central tick drives all three devices. The live game calls `tick` from a
 * single interval and offline catch-up calls the same function with fixed
 * steps, so online and offline play obey identical economic rules.
 */

export interface TickSummary {
  cardsBought: number;
  cardsScratched: number;
  cardsClaimed: number;
  cardsDiscarded: number;
  cashGained: number;
}

function emptySummary(): TickSummary {
  return { cardsBought: 0, cardsScratched: 0, cardsClaimed: 0, cardsDiscarded: 0, cashGained: 0 };
}

/** Largest single step the tick will simulate, to keep behaviour bounded. */
const MAX_STEP_MS = 1000;
/** Safety bound on actions per device per tick. */
const MAX_ACTIONS_PER_TICK = 50;

export function scratcherRate(state: GameState): number {
  const level = state.upgrades.scratcher ?? 0;
  if (level <= 0) return 0;
  return scratchRate(level) * (1 + 0.3 * (state.permanent.fasterScratcher ?? 0));
}

export function autoBuyQueueLimit(state: GameState): number {
  return Math.min(queueCapacity(state), Math.max(1, state.settings.autoBuyQueueLimit));
}

function setStatus(state: GameState, id: 'buyer' | 'scratcher' | 'collector', status: AutomationStatus) {
  state.automation[id].status = status;
}

/** Advances the whole simulation by `dtMs` milliseconds. */
export function tick(state: GameState, dtMs: number): TickSummary {
  const summary = emptySummary();
  let remaining = Math.max(0, Math.min(dtMs, OFFLINE_CAP_MS));
  let guard = 0;
  while (remaining > 0 && guard++ < 100000) {
    const step = Math.min(MAX_STEP_MS, remaining);
    stepOnce(state, step, summary);
    remaining -= step;
  }
  return summary;
}

function stepOnce(state: GameState, dt: number, summary: TickSummary): void {
  state.playTimeMs += dt;
  state.jobCooldownMs = Math.max(0, state.jobCooldownMs - dt);
  runBuyer(state, dt, summary);
  runScratcher(state, dt, summary);
  runCollector(state, dt, summary);
}

/* ── Buyer ─────────────────────────────────────────────────────────────── */

function runBuyer(state: GameState, dt: number, summary: TickSummary): void {
  const level = state.upgrades.buyer ?? 0;
  const device = state.automation.buyer;
  if (level <= 0) {
    device.status = 'locked';
    return;
  }
  if (!device.enabled) {
    device.status = 'off';
    return;
  }

  const interval = buyerInterval(level);
  device.accumulatorMs += dt;
  const options: BuyOptions = {
    auto: true,
    reserve: Math.max(0, state.settings.reserveCash),
    queueLimit: autoBuyQueueLimit(state),
  };

  let actions = 0;
  while (device.accumulatorMs >= interval && actions < MAX_ACTIONS_PER_TICK) {
    const result = buyCard(state, state.selectedTicketId, options);
    if (result.ok) {
      device.accumulatorMs -= interval;
      actions++;
      summary.cardsBought++;
      setStatus(state, 'buyer', 'working');
      continue;
    }
    device.accumulatorMs = Math.min(device.accumulatorMs, interval);
    if (result.reason === 'queue-full') setStatus(state, 'buyer', 'queue-full');
    else if (result.reason === 'locked') setStatus(state, 'buyer', 'off');
    else {
      const cost = costOfSelected(state);
      setStatus(
        state,
        'buyer',
        state.cash < cost ? 'waiting-cash' : 'reserve-reached',
      );
    }
    return;
  }
  if (actions > 0) setStatus(state, 'buyer', 'working');
}

function costOfSelected(state: GameState): number {
  return findTicket(state.selectedTicketId)?.cost ?? 0;
}

/* ── Scratcher ─────────────────────────────────────────────────────────── */

function runScratcher(state: GameState, dt: number, summary: TickSummary): void {
  const level = state.upgrades.scratcher ?? 0;
  const device = state.automation.scratcher;
  if (level <= 0) {
    device.status = 'locked';
    return;
  }
  if (!device.enabled) {
    device.status = 'off';
    return;
  }

  const capacity = scratcherCapacity(level);
  const rate = scratcherRate(state);
  const targets = state.cards.filter((c) => c.status === 'unrevealed').slice(0, capacity);
  if (targets.length === 0) {
    device.status = 'waiting-card';
    return;
  }
  device.status = 'working';
  const delta = (rate * dt) / 1000;
  for (const card of targets) {
    const before = card.status;
    scratchCard(state, card.id, delta);
    if (before === 'unrevealed' && card.status === 'revealed') summary.cardsScratched++;
  }
}

/* ── Collector ─────────────────────────────────────────────────────────── */

function runCollector(state: GameState, dt: number, summary: TickSummary): void {
  const level = state.upgrades.collector ?? 0;
  const device = state.automation.collector;
  if (level <= 0) {
    device.status = 'locked';
    return;
  }
  if (!device.enabled) {
    device.status = 'off';
    return;
  }

  const interval = collectorInterval(level);
  device.accumulatorMs += dt;
  const careful = (state.permanent.carefulCollector ?? 0) > 0;

  let actions = 0;
  while (device.accumulatorMs >= interval && actions < MAX_ACTIONS_PER_TICK) {
    const card = state.cards.find((c) => c.status === 'revealed');
    if (!card) {
      device.accumulatorMs = Math.min(device.accumulatorMs, interval);
      device.status = state.cards.some((c) => c.status === 'held') ? 'holding-risky' : 'waiting-card';
      return;
    }
    device.accumulatorMs -= interval;
    actions++;

    if (card.payout < 0) {
      if (careful) {
        discardCard(state, card.id);
        summary.cardsDiscarded++;
        device.status = 'working';
      } else if (state.settings.autoClaimRisky) {
        const before = state.cash;
        claimCard(state, card.id, { confirmNegative: true, auto: true });
        summary.cashGained += state.cash - before;
        summary.cardsClaimed++;
        device.status = 'working';
      } else {
        // Hold the card for the player instead of silently deducting money.
        card.status = 'held';
        device.status = 'holding-risky';
      }
      continue;
    }

    const before = state.cash;
    const result = claimCard(state, card.id, { auto: true });
    if (result.ok) {
      summary.cashGained += state.cash - before;
      summary.cardsClaimed++;
      device.status = 'working';
    }
  }
  if (actions > 0 && device.status !== 'holding-risky') device.status = 'working';
}

/* ── Offline progress ──────────────────────────────────────────────────── */

/**
 * Credits time spent away using the same rules as live play.
 *
 * The elapsed time is capped at two hours and simulated with bounded fixed
 * steps (never per-frame), and `lastTickAt` is advanced by exactly the amount
 * credited so the same period can never be credited twice.
 */
export function applyOffline(state: GameState, now: number): OfflineReport {
  const elapsed = Math.max(0, now - state.lastTickAt);
  const credited = Math.min(elapsed, OFFLINE_CAP_MS);
  const report: OfflineReport = {
    elapsedMs: elapsed,
    creditedMs: credited,
    cashGained: 0,
    cardsBought: 0,
    cardsClaimed: 0,
  };
  // Always move the clock forward, even when nothing is credited, so the same
  // offline window cannot be processed a second time.
  state.lastTickAt = now;
  if (credited < OFFLINE_STEP_MS) return report;

  const cashBefore = state.cash;
  const steps = Math.floor(credited / OFFLINE_STEP_MS);
  const summary = emptySummary();
  for (let i = 0; i < steps; i++) {
    stepOnce(state, OFFLINE_STEP_MS, summary);
  }
  report.cashGained = state.cash - cashBefore;
  report.cardsBought = summary.cardsBought;
  report.cardsClaimed = summary.cardsClaimed;
  return report;
}

export const AUTOMATION_STATUS_TEXT: Record<AutomationStatus, string> = {
  locked: 'Not built yet',
  off: 'Paused by player',
  working: 'Working',
  'waiting-cash': 'Waiting for cash',
  'queue-full': 'Queue full',
  'waiting-card': 'Waiting for a card',
  'reserve-reached': 'Reserve limit reached',
  'holding-risky': 'Holding a risky card for review',
};
