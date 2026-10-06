import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, createInitialState } from '../state';
import { deserialize, importSave, serialize } from '../save';
import { buyCard, revealCard } from '../economy';
import { DEFAULT_TICKET_ID } from '../data/tickets';
import {
  CURRENCY_SYMBOL,
  MAX_CURRENCY,
  clampCurrency,
  formatCash,
  formatDuration,
  formatNumber,
  formatPercent,
} from '../format';

describe('save round trip', () => {
  it('preserves cash, progression and card outcomes exactly', () => {
    const state = createInitialState({ now: 1000, seed: 42 });
    state.cash = 1234.56;
    state.runWinnings = 9876.5;
    state.totalWinnings = 20000;
    state.upgrades.luck = 3;
    state.blueprints = 7;
    state.permanent.capital = 2;
    const a = buyCard(state, DEFAULT_TICKET_ID).value!;
    const b = buyCard(state, DEFAULT_TICKET_ID).value!;
    revealCard(state, b.id);

    const loaded = deserialize(JSON.parse(serialize(state)));
    expect(loaded.status).toBe('ok');
    const next = loaded.state;
    expect(next.version).toBe(SAVE_VERSION);
    expect(next.cash).toBeCloseTo(state.cash, 6);
    expect(next.runWinnings).toBeCloseTo(state.runWinnings, 6);
    expect(next.totalWinnings).toBeCloseTo(state.totalWinnings, 6);
    expect(next.upgrades.luck).toBe(3);
    expect(next.blueprints).toBe(7);
    expect(next.permanent.capital).toBe(2);

    const loadedA = next.cards.find((c) => c.id === a.id)!;
    const loadedB = next.cards.find((c) => c.id === b.id)!;
    expect(loadedA.cells).toEqual(a.cells);
    expect(loadedA.payout).toBe(a.payout);
    expect(loadedA.status).toBe('unrevealed');
    expect(loadedB.cells).toEqual(b.cells);
    expect(loadedB.payout).toBe(b.payout);
    expect(loadedB.status).toBe('revealed');
  });

  it('does not reroll an outcome on reload', () => {
    const state = createInitialState({ now: 0, seed: 5 });
    state.cash = 100;
    const card = buyCard(state, DEFAULT_TICKET_ID).value!;
    const before = JSON.stringify(card.cells);
    for (let i = 0; i < 5; i++) {
      const reloaded = deserialize(JSON.parse(serialize(state))).state;
      const same = reloaded.cards.find((c) => c.id === card.id)!;
      expect(JSON.stringify(same.cells)).toBe(before);
      expect(same.payout).toBe(card.payout);
    }
  });
});

describe('save validation', () => {
  it('rejects non-objects without crashing', () => {
    for (const bad of [null, undefined, 42, 'nope', true]) {
      const result = deserialize(bad);
      expect(result.status).toBe('corrupt');
      expect(result.state.cash).toBeGreaterThanOrEqual(0);
    }
  });

  it('repairs malformed fields instead of failing', () => {
    const result = deserialize({
      version: 1,
      cash: 'lots',
      runWinnings: NaN,
      upgrades: { luck: 'three' },
      cards: [{ ticketId: 'does-not-exist', cells: [] }, 'garbage', null],
      settings: { reserveCash: -50 },
    });
    expect(['ok', 'repaired']).toContain(result.status);
    expect(Number.isFinite(result.state.cash)).toBe(true);
    expect(Number.isFinite(result.state.runWinnings)).toBe(true);
    expect(result.state.cards).toHaveLength(0);
    expect(result.state.settings.reserveCash).toBeGreaterThanOrEqual(0);
  });

  it('drops cards whose symbols do not match the ticket', () => {
    const state = createInitialState({ now: 0, seed: 3 });
    state.cash = 100;
    const card = buyCard(state, DEFAULT_TICKET_ID).value!;
    const raw = JSON.parse(serialize(state));
    raw.cards[0].cells = ['not-a-symbol'];
    const result = deserialize(raw);
    expect(result.state.cards.find((c) => c.id === card.id)).toBeUndefined();
  });

  it('import rejects invalid JSON gracefully', () => {
    const result = importSave('{ this is not json');
    expect(result.status).toBe('corrupt');
    expect(result.state).toBeTruthy();
  });

  it('import accepts an exported save', () => {
    const state = createInitialState({ now: 0, seed: 8 });
    state.cash = 777;
    const result = importSave(serialize(state));
    expect(result.status).toBe('ok');
    expect(result.state.cash).toBe(777);
  });
});

describe('currency formatting', () => {
  it('uses a single formatter with K/M/B/T suffixes', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1500)).toBe('1.50K');
    expect(formatNumber(2_500_000)).toBe('2.50M');
    expect(formatNumber(3_200_000_000)).toBe('3.20B');
    expect(formatNumber(4_100_000_000_000)).toBe('4.10T');
    expect(formatCash(1500)).toBe(`${CURRENCY_SYMBOL}1.50K`);
  });

  it('formats negatives, percents and durations', () => {
    expect(formatCash(-250)).toContain('-');
    expect(formatPercent(0.5)).toContain('%');
    expect(formatDuration(65_000)).toMatch(/1m/);
  });

  it('clamps currency to a safe tested range and never yields NaN', () => {
    expect(clampCurrency(Number.POSITIVE_INFINITY)).toBe(MAX_CURRENCY);
    expect(clampCurrency(NaN)).toBe(0);
    expect(clampCurrency(-MAX_CURRENCY * 10)).toBe(-MAX_CURRENCY);
    expect(Number.isFinite(clampCurrency(1e308))).toBe(true);
  });
});
