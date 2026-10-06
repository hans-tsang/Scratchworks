import { beforeEach, describe, expect, it } from 'vitest';
import {
  buyCard,
  claimCard,
  discardCard,
  findCard,
  revealCard,
  runUpgradeCost,
  buyRunUpgrade,
  scratchCard,
  workshopJob,
  REVEAL_THRESHOLD,
} from '../economy';
import { createInitialState, queueCapacity, queueUsed } from '../state';
import { TICKETS, DEFAULT_TICKET_ID, getTicket } from '../data/tickets';
import { createRng } from '../rng';
import type { GameState } from '../types';

function freshState(cash = 1000): GameState {
  const state = createInitialState({ now: 0, seed: 1234 });
  state.cash = cash;
  return state;
}

const RISKY_TICKET = TICKETS.find((t) => t.risky && t.collectionId === 'bench')!;

describe('purchases', () => {
  let state: GameState;
  beforeEach(() => {
    state = freshState();
  });

  it('subtracts the cost exactly once', () => {
    const ticket = getTicket(DEFAULT_TICKET_ID);
    const before = state.cash;
    const result = buyCard(state, ticket.id);
    expect(result.ok).toBe(true);
    expect(state.cash).toBeCloseTo(before - ticket.cost, 6);
    expect(state.cards).toHaveLength(1);
  });

  it('refuses a purchase the player cannot afford', () => {
    state.cash = 0;
    const result = buyCard(state, DEFAULT_TICKET_ID);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient-funds');
    expect(state.cards).toHaveLength(0);
    expect(state.cash).toBe(0);
  });

  it('refuses tickets from locked collections', () => {
    const locked = TICKETS.find((t) => t.collectionId !== 'bench')!;
    state.cash = 1e9;
    const result = buyCard(state, locked.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('locked');
  });

  it('respects the queue capacity', () => {
    const capacity = queueCapacity(state);
    for (let i = 0; i < capacity; i++) expect(buyCard(state, DEFAULT_TICKET_ID).ok).toBe(true);
    expect(queueUsed(state)).toBe(capacity);
    const overflow = buyCard(state, DEFAULT_TICKET_ID);
    expect(overflow.ok).toBe(false);
    expect(overflow.reason).toBe('queue-full');
  });

  it('respects a reserve-cash floor', () => {
    const ticket = getTicket(DEFAULT_TICKET_ID);
    state.cash = ticket.cost + 5;
    const blocked = buyCard(state, ticket.id, { auto: true, reserve: 10 });
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe('insufficient-funds');
    const allowed = buyCard(state, ticket.id, { auto: true, reserve: 5 });
    expect(allowed.ok).toBe(true);
  });

  it('respects an explicit queue limit below capacity', () => {
    expect(buyCard(state, DEFAULT_TICKET_ID, { auto: true, queueLimit: 1 }).ok).toBe(true);
    const second = buyCard(state, DEFAULT_TICKET_ID, { auto: true, queueLimit: 1 });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('queue-full');
  });

  it('stores an outcome whose payout matches its symbols', () => {
    const card = buyCard(state, DEFAULT_TICKET_ID).value!;
    expect(card.cells.length).toBeGreaterThan(0);
    expect(card.status).toBe('unrevealed');
    expect(card.progress).toBe(0);
    expect(Number.isFinite(card.payout)).toBe(true);
  });
});

describe('scratching and revealing', () => {
  it('auto-reveals once the coverage threshold is passed', () => {
    const state = freshState();
    const card = buyCard(state, DEFAULT_TICKET_ID).value!;
    scratchCard(state, card.id, REVEAL_THRESHOLD - 0.05);
    expect(card.status).toBe('unrevealed');
    scratchCard(state, card.id, 0.06);
    expect(card.status).toBe('revealed');
    expect(card.progress).toBe(1);
  });

  it('the Reveal card button produces the same outcome as scratching', () => {
    const state = freshState();
    const card = buyCard(state, DEFAULT_TICKET_ID).value!;
    const cellsBefore = [...card.cells];
    const payoutBefore = card.payout;
    revealCard(state, card.id);
    expect(card.status).toBe('revealed');
    expect(card.cells).toEqual(cellsBefore);
    expect(card.payout).toBe(payoutBefore);
  });

  it('never rerolls an outcome while scratching', () => {
    const state = freshState();
    const card = buyCard(state, DEFAULT_TICKET_ID).value!;
    const snapshot = JSON.stringify({ cells: card.cells, payout: card.payout });
    for (let i = 0; i < 20; i++) scratchCard(state, card.id, 0.05);
    expect(JSON.stringify({ cells: card.cells, payout: card.payout })).toBe(snapshot);
  });
});

describe('claiming and discarding', () => {
  it('cannot claim an unrevealed card', () => {
    const state = freshState();
    const card = buyCard(state, DEFAULT_TICKET_ID).value!;
    const result = claimCard(state, card.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not-revealed');
  });

  it('pays exactly once and cannot be claimed twice', () => {
    const state = freshState();
    // Find a positive card.
    let card = buyCard(state, DEFAULT_TICKET_ID).value!;
    while (card.payout <= 0) {
      revealCard(state, card.id);
      discardCard(state, card.id);
      card = buyCard(state, DEFAULT_TICKET_ID).value!;
    }
    revealCard(state, card.id);
    const before = state.cash;
    const first = claimCard(state, card.id);
    expect(first.ok).toBe(true);
    expect(state.cash).toBeCloseTo(before + card.payout, 6);
    const afterFirst = state.cash;
    const second = claimCard(state, card.id);
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('already-resolved');
    expect(state.cash).toBe(afterFirst);
  });

  it('counts gross winnings separately from cash', () => {
    const state = freshState();
    let card = buyCard(state, DEFAULT_TICKET_ID).value!;
    while (card.payout <= 0) {
      revealCard(state, card.id);
      discardCard(state, card.id);
      card = buyCard(state, DEFAULT_TICKET_ID).value!;
    }
    revealCard(state, card.id);
    const winningsBefore = state.runWinnings;
    claimCard(state, card.id);
    expect(state.runWinnings).toBeCloseTo(winningsBefore + card.payout, 6);
    expect(state.totalWinnings).toBeGreaterThanOrEqual(state.runWinnings);
  });

  it('a discarded card can never be claimed afterwards', () => {
    const state = freshState();
    const card = buyCard(state, DEFAULT_TICKET_ID).value!;
    revealCard(state, card.id);
    expect(discardCard(state, card.id).ok).toBe(true);
    expect(card.status).toBe('discarded');
    const claim = claimCard(state, card.id);
    expect(claim.ok).toBe(false);
    expect(claim.reason).toBe('already-resolved');
  });

  it('discarding does not refund the purchase cost', () => {
    const state = freshState();
    const before = state.cash;
    const card = buyCard(state, DEFAULT_TICKET_ID).value!;
    revealCard(state, card.id);
    discardCard(state, card.id);
    expect(state.cash).toBeCloseTo(before - card.cost, 6);
  });
});

describe('risk protection', () => {
  function negativeCard(state: GameState) {
    state.cash = 1e6;
    for (let i = 0; i < 4000; i++) {
      const card = buyCard(state, RISKY_TICKET.id, { rng: createRng(1000 + i) }).value;
      if (!card) continue;
      revealCard(state, card.id);
      if (card.payout < 0) return card;
      discardCard(state, card.id);
    }
    throw new Error('no negative card generated');
  }

  it('holds a negative card instead of claiming it without confirmation', () => {
    const state = freshState();
    const card = negativeCard(state);
    const before = state.cash;
    const result = claimCard(state, card.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('needs-confirmation');
    expect(card.status).toBe('held');
    expect(state.cash).toBe(before);
  });

  it('applies the loss only with explicit confirmation', () => {
    const state = freshState();
    const card = negativeCard(state);
    claimCard(state, card.id); // held
    const before = state.cash;
    const result = claimCard(state, card.id, { confirmNegative: true });
    expect(result.ok).toBe(true);
    expect(state.cash).toBeCloseTo(before + card.payout, 6);
  });

  it('never lets a negative claim push cash below zero', () => {
    const state = freshState();
    const card = negativeCard(state);
    state.cash = 0.5;
    claimCard(state, card.id, { confirmNegative: true });
    expect(state.cash).toBeGreaterThanOrEqual(0);
  });

  it('allows a negative card to be discarded instead', () => {
    const state = freshState();
    const card = negativeCard(state);
    claimCard(state, card.id);
    const before = state.cash;
    expect(discardCard(state, card.id).ok).toBe(true);
    expect(state.cash).toBe(before);
  });
});

describe('recovery income and upgrades', () => {
  it('the workshop job always pays and never costs anything', () => {
    const state = freshState(0);
    const result = workshopJob(state);
    expect(result.ok).toBe(true);
    expect(state.cash).toBeGreaterThan(0);
    // Second attempt is on cooldown rather than negative.
    const second = workshopJob(state);
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('cooldown');
  });

  it('run upgrades get more expensive and apply immediately', () => {
    const state = freshState(1e6);
    const first = runUpgradeCost(state, 'luck');
    expect(buyRunUpgrade(state, 'luck').ok).toBe(true);
    expect(state.upgrades.luck).toBe(1);
    expect(runUpgradeCost(state, 'luck')).toBeGreaterThan(first);
  });

  it('refuses upgrades the player cannot afford', () => {
    const state = freshState(0);
    const result = buyRunUpgrade(state, 'luck');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient-funds');
    expect(state.upgrades.luck ?? 0).toBe(0);
  });
});

describe('card lookup', () => {
  it('returns undefined for unknown ids', () => {
    expect(findCard(freshState(), 'nope')).toBeUndefined();
  });
});
