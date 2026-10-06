import { describe, expect, it } from 'vitest';
import { applyOffline, autoBuyQueueLimit, tick } from '../automation';
import { OFFLINE_CAP_MS } from '../data/upgrades';
import { DEFAULT_TICKET_ID, TICKETS, getTicket } from '../data/tickets';
import { buyCard, claimCard, revealCard } from '../economy';
import { createInitialState, queueCapacity, queueUsed } from '../state';
import type { GameState } from '../types';

const RISKY_TICKET = TICKETS.find((t) => t.risky && t.collectionId === 'bench')!;

function automatedState(cash = 5000): GameState {
  const state = createInitialState({ now: 0, seed: 55 });
  state.cash = cash;
  state.upgrades.buyer = 3;
  state.upgrades.scratcher = 3;
  state.upgrades.collector = 3;
  state.upgrades.rack = 4;
  for (const id of ['buyer', 'scratcher', 'collector'] as const) {
    state.automation[id].enabled = true;
    state.automation[id].status = 'working';
  }
  return state;
}

describe('buyer', () => {
  it('buys cards while it can and reports working', () => {
    const state = automatedState();
    tick(state, 5000);
    expect(state.automation.buyer.status).not.toBe('locked');
    expect(state.totalCards + queueUsed(state)).toBeGreaterThan(0);
  });

  it('is locked until built and off when disabled', () => {
    const state = createInitialState({ now: 0, seed: 1 });
    tick(state, 1000);
    expect(state.automation.buyer.status).toBe('locked');
    expect(state.automation.scratcher.status).toBe('locked');
    expect(state.automation.collector.status).toBe('locked');

    state.upgrades.buyer = 1;
    state.automation.buyer.enabled = false;
    tick(state, 1000);
    expect(state.automation.buyer.status).toBe('off');
    expect(state.cards).toHaveLength(0);
  });

  it('never spends below the configured reserve', () => {
    const state = automatedState(500);
    state.settings.reserveCash = 400;
    tick(state, 60000);
    expect(state.cash).toBeGreaterThanOrEqual(400 - 1e-6);
  });

  it('reports waiting-cash when broke and never goes negative', () => {
    const state = automatedState(0);
    state.upgrades.scratcher = 0;
    state.upgrades.collector = 0;
    tick(state, 10000);
    expect(state.cash).toBeGreaterThanOrEqual(0);
    expect(state.automation.buyer.status).toBe('waiting-cash');
  });

  it('respects the auto-buy queue limit', () => {
    const state = automatedState(1e6);
    state.upgrades.scratcher = 0;
    state.upgrades.collector = 0;
    state.settings.autoBuyQueueLimit = 2;
    expect(autoBuyQueueLimit(state)).toBe(2);
    tick(state, 120000);
    expect(queueUsed(state)).toBeLessThanOrEqual(2);
    expect(state.automation.buyer.status).toBe('queue-full');
  });

  it('never exceeds the queue capacity even with a huge configured limit', () => {
    const state = automatedState(1e6);
    state.upgrades.scratcher = 0;
    state.upgrades.collector = 0;
    state.settings.autoBuyQueueLimit = 9999;
    tick(state, 120000);
    expect(queueUsed(state)).toBeLessThanOrEqual(queueCapacity(state));
  });
});

describe('scratcher and collector', () => {
  it('reveals and claims cards using the same model as manual play', () => {
    const state = automatedState(2000);
    tick(state, 60000);
    expect(state.totalCards).toBeGreaterThan(0);
    expect(state.runWinnings).toBeGreaterThan(0);
    for (const card of state.cards) {
      if (card.status === 'claimed') expect(card.progress).toBe(1);
    }
  });

  it('reports waiting-card when the bench is empty', () => {
    const state = createInitialState({ now: 0, seed: 3 });
    state.upgrades.scratcher = 2;
    state.upgrades.collector = 2;
    state.automation.scratcher.enabled = true;
    state.automation.collector.enabled = true;
    tick(state, 2000);
    expect(state.automation.scratcher.status).toBe('waiting-card');
    expect(state.automation.collector.status).toBe('waiting-card');
  });

  it('taking a card manually does not turn the collector off', () => {
    const state = automatedState(2000);
    state.automation.collector.enabled = true;
    tick(state, 3000);
    const card = buyCard(state, DEFAULT_TICKET_ID).value!;
    revealCard(state, card.id);
    claimCard(state, card.id, { confirmNegative: true });
    expect(state.automation.collector.enabled).toBe(true);
    tick(state, 3000);
    expect(state.automation.collector.enabled).toBe(true);
    expect(state.automation.collector.status).not.toBe('off');
  });

  it('holds negative cards for review by default instead of deducting cash', () => {
    const state = automatedState(1e6);
    state.selectedTicketId = RISKY_TICKET.id;
    expect(state.settings.autoClaimRisky).toBe(false);
    tick(state, 120000);
    const held = state.cards.filter((c) => c.status === 'held');
    if (held.length > 0) {
      expect(state.automation.collector.status).toBe('holding-risky');
      for (const card of held) expect(card.payout).toBeLessThan(0);
    }
    // No automatic negative claim may have happened.
    for (const card of state.cards) {
      if (card.status === 'claimed') expect(card.payout).toBeGreaterThanOrEqual(0);
    }
  });

  it('Careful Collector discards negative cards automatically', () => {
    const state = automatedState(1e6);
    state.selectedTicketId = RISKY_TICKET.id;
    state.permanent.carefulCollector = 1;
    tick(state, 120000);
    expect(state.cards.some((c) => c.status === 'held')).toBe(false);
    for (const card of state.cards) {
      if (card.status === 'claimed') expect(card.payout).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('offline progress', () => {
  it('is capped at two hours', () => {
    const state = automatedState(1e6);
    state.lastTickAt = 0;
    const report = applyOffline(state, OFFLINE_CAP_MS * 10);
    expect(report.creditedMs).toBe(OFFLINE_CAP_MS);
    expect(report.elapsedMs).toBe(OFFLINE_CAP_MS * 10);
  });

  it('never credits the same window twice', () => {
    const state = automatedState(1e6);
    state.lastTickAt = 0;
    const now = 60 * 60 * 1000;
    const first = applyOffline(state, now);
    expect(first.creditedMs).toBe(now);
    expect(state.lastTickAt).toBe(now);
    const second = applyOffline(state, now);
    expect(second.creditedMs).toBe(0);
    expect(second.cashGained).toBe(0);
    expect(second.cardsBought).toBe(0);
  });

  it('advances the clock even when nothing is credited', () => {
    const state = createInitialState({ now: 0, seed: 9 });
    state.lastTickAt = 0;
    applyOffline(state, 5);
    expect(state.lastTickAt).toBe(5);
  });

  it('uses the same rules as online play, including reserve cash', () => {
    const state = automatedState(800);
    state.settings.reserveCash = 700;
    state.lastTickAt = 0;
    applyOffline(state, 60 * 60 * 1000);
    expect(state.cash).toBeGreaterThanOrEqual(700 - 1e-6);
  });

  it('does nothing without automation', () => {
    const state = createInitialState({ now: 0, seed: 11 });
    state.cash = 500;
    state.lastTickAt = 0;
    const report = applyOffline(state, 60 * 60 * 1000);
    expect(report.cardsBought).toBe(0);
    expect(report.cardsClaimed).toBe(0);
    expect(state.cash).toBe(500);
  });
});

describe('numeric safety', () => {
  it('keeps cash finite over a long automated run', () => {
    const state = automatedState(1e6);
    state.selectedTicketId = getTicket(DEFAULT_TICKET_ID).id;
    for (let i = 0; i < 30; i++) tick(state, 60000);
    expect(Number.isFinite(state.cash)).toBe(true);
    expect(Number.isNaN(state.cash)).toBe(false);
    expect(state.cash).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(state.runWinnings)).toBe(true);
  });
});
