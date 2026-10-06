import { describe, expect, it } from 'vitest';
import { PRESTIGE_REQUIREMENT, PERMANENT_UPGRADES } from '../data/upgrades';
import { buyPermanentUpgrade, canPrestige, permanentUpgradeCost, prestige, prestigePreview } from '../prestige';
import { buyCard } from '../economy';
import { DEFAULT_TICKET_ID } from '../data/tickets';
import { createInitialState } from '../state';
import type { GameState } from '../types';

function readyToPrestige(): GameState {
  const state = createInitialState({ now: 0, seed: 77 });
  state.cash = 5000;
  state.runWinnings = PRESTIGE_REQUIREMENT;
  state.totalWinnings = PRESTIGE_REQUIREMENT;
  state.upgrades.luck = 5;
  state.unlockedCollections = ['bench', 'copper'];
  state.settings.reducedMotion = true;
  buyCard(state, DEFAULT_TICKET_ID);
  return state;
}

describe('prestige availability', () => {
  it('requires the displayed milestone', () => {
    const state = createInitialState({ now: 0, seed: 1 });
    expect(canPrestige(state)).toBe(false);
    const preview = prestigePreview(state);
    expect(preview.requirement).toBe(PRESTIGE_REQUIREMENT);
    expect(preview.available).toBe(false);
    expect(preview.pendingAward).toBe(0);
    expect(preview.resets.length).toBeGreaterThan(0);
    expect(preview.keeps.length).toBeGreaterThan(0);
  });

  it('separates owned Blueprints from the pending award', () => {
    const state = readyToPrestige();
    state.blueprints = 4;
    const preview = prestigePreview(state);
    expect(preview.owned).toBe(4);
    expect(preview.pendingAward).toBeGreaterThan(0);
    // The pending award must not already be in the owned balance.
    expect(state.blueprints).toBe(4);
  });

  it('does nothing when the milestone is not met', () => {
    const state = createInitialState({ now: 0, seed: 2 });
    state.runWinnings = PRESTIGE_REQUIREMENT - 1;
    const next = prestige(state, 0);
    expect(next).toBe(state);
    expect(state.prestigeCount).toBe(0);
  });
});

describe('prestige reset and persistence', () => {
  it('resets run progress and keeps permanent progress', () => {
    const state = readyToPrestige();
    state.permanent.capital = 2;
    const award = prestigePreview(state).pendingAward;
    const next = prestige(state, 1000);

    // Reset.
    expect(next.runWinnings).toBe(0);
    expect(next.runCards).toBe(0);
    expect(next.cards).toHaveLength(0);
    expect(next.upgrades.luck ?? 0).toBe(0);
    expect(next.unlockedCollections).toEqual(['bench']);

    // Persisted.
    expect(next.blueprints).toBe(award);
    expect(next.permanent.capital).toBe(2);
    expect(next.totalWinnings).toBe(state.totalWinnings);
    expect(next.totalCards).toBe(state.totalCards);
    expect(next.settings.reducedMotion).toBe(true);
    expect(next.prestigeCount).toBe(1);
  });

  it('starting capital raises the cash of the new run', () => {
    const plain = createInitialState({ now: 0 });
    const funded = createInitialState({ now: 0, permanent: { capital: 3 } });
    expect(funded.cash).toBeGreaterThan(plain.cash);
  });

  it('the automation starter kit pre-builds devices', () => {
    const kitted = createInitialState({ now: 0, permanent: { starterKit: 3 } });
    expect(kitted.upgrades.buyer).toBe(1);
    expect(kitted.upgrades.scratcher).toBe(1);
    expect(kitted.upgrades.collector).toBe(1);
    expect(kitted.automation.buyer.enabled).toBe(true);
  });
});

describe('permanent upgrades', () => {
  it('spends Blueprints once and increases the next cost', () => {
    const state = createInitialState({ now: 0 });
    state.blueprints = 1000;
    const def = PERMANENT_UPGRADES[0];
    const cost = permanentUpgradeCost(state, def.id);
    expect(buyPermanentUpgrade(state, def.id).ok).toBe(true);
    expect(state.blueprints).toBe(1000 - cost);
    expect(state.permanent[def.id]).toBe(1);
    expect(permanentUpgradeCost(state, def.id)).toBeGreaterThan(cost);
  });

  it('refuses purchases without enough Blueprints', () => {
    const state = createInitialState({ now: 0 });
    state.blueprints = 0;
    const result = buyPermanentUpgrade(state, PERMANENT_UPGRADES[0].id);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient-blueprints');
  });

  it('stops at the maximum level', () => {
    const state = createInitialState({ now: 0 });
    const def = PERMANENT_UPGRADES[0];
    state.blueprints = 1e9;
    for (let i = 0; i < def.maxLevel; i++) expect(buyPermanentUpgrade(state, def.id).ok).toBe(true);
    const extra = buyPermanentUpgrade(state, def.id);
    expect(extra.ok).toBe(false);
    expect(extra.reason).toBe('max-level');
  });

  it('includes Careful Collector in the tree', () => {
    expect(PERMANENT_UPGRADES.some((u) => u.id === 'carefulCollector')).toBe(true);
  });
});
