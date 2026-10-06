import { formatCash, formatDuration } from './format';
import { COLLECTIONS, findTicket, getTicket } from './data/tickets';
import {
  PRESTIGE_REQUIREMENT,
  RUN_UPGRADES,
  TICKET_LEVEL_MAX,
  ticketLevelCost,
  ticketLevelRequirement,
  upgradeCost,
} from './data/upgrades';
import { availableTickets, nextLockedCollection, ticketLevel } from './state';
import type { GameState } from './types';

/**
 * "Next goal" advisor: always offers one concrete, affordable next step, or
 * explains exactly what is missing. This is what keeps the player from getting
 * stuck without a route forward.
 */

export interface Goal {
  title: string;
  detail: string;
  /** Optional progress bar fraction 0..1. */
  progress?: number;
  action?: { kind: 'upgrade' | 'ticketLevel' | 'job' | 'prestige' | 'buy'; id: string; label: string };
}

export function nextGoal(state: GameState): Goal {
  const tickets = availableTickets(state);
  const cheapest = tickets.reduce((a, b) => (a.cost <= b.cost ? a : b), tickets[0]);

  // 1. Cannot afford anything at all → the Workshop job is always available.
  if (state.cash < cheapest.cost) {
    return {
      title: 'Earn some credits',
      detail: `You cannot afford ${cheapest.name} (${formatCash(cheapest.cost)}). Work a Workshop job — it always pays and never costs anything.`,
      progress: Math.min(1, state.cash / cheapest.cost),
      action: { kind: 'job', id: 'job', label: 'Work a Workshop job' },
    };
  }

  // 2. Suggest the cheapest meaningful run upgrade the player can afford.
  const affordable = RUN_UPGRADES.map((def) => {
    const level = state.upgrades[def.id] ?? 0;
    return { def, level, cost: upgradeCost(def, level) };
  })
    .filter((u) => u.level < u.def.maxLevel && u.cost <= state.cash)
    .sort((a, b) => a.cost - b.cost);

  const automationFirst = affordable.find((u) => u.def.category === 'automation' && u.level === 0);
  const pick = automationFirst ?? affordable[0];
  if (pick) {
    return {
      title: `Buy ${pick.def.name}`,
      detail: `${formatCash(pick.cost)} — ${pick.def.effect(pick.level)}`,
      action: { kind: 'upgrade', id: pick.def.id, label: `Buy ${pick.def.name}` },
    };
  }

  // 3. A ticket level that is ready to buy.
  for (const ticket of tickets) {
    const level = ticketLevel(state, ticket.id);
    if (level >= TICKET_LEVEL_MAX) continue;
    const completed = state.ticketCards[ticket.id] ?? 0;
    const cost = ticketLevelCost(ticket.cost, level);
    if (completed >= ticketLevelRequirement(level) && cost <= state.cash) {
      return {
        title: `Upgrade ${ticket.name}`,
        detail: `${formatCash(cost)} for +6% payouts on this ticket.`,
        action: { kind: 'ticketLevel', id: ticket.id, label: `Upgrade ${ticket.name}` },
      };
    }
  }

  // 4. Progress toward the next collection.
  const locked = nextLockedCollection(state);
  if (locked) {
    const byWinnings = state.runWinnings / locked.unlockWinnings;
    const byCards = locked.unlockCards > 0 ? state.runCards / locked.unlockCards : 0;
    const best = Math.max(byWinnings, byCards);
    return {
      title: `Unlock ${locked.name}`,
      detail: `Reach ${formatCash(locked.unlockWinnings)} gross winnings this run (now ${formatCash(state.runWinnings)}) or complete ${locked.unlockCards} cards (now ${state.runCards}).`,
      progress: Math.min(1, best),
      action: {
        kind: 'buy',
        id: bestProgressTicket(state),
        label: `Buy ${getTicket(bestProgressTicket(state)).name}`,
      },
    };
  }

  // 5. Prestige.
  if (state.runWinnings >= PRESTIGE_REQUIREMENT) {
    return {
      title: 'File your Blueprints',
      detail: 'You have met the prestige milestone. Open the Prestige panel to review exactly what resets.',
      progress: 1,
      action: { kind: 'prestige', id: 'prestige', label: 'Open prestige' },
    };
  }

  return {
    title: 'Build toward prestige',
    detail: `Reach ${formatCash(PRESTIGE_REQUIREMENT)} gross winnings this run (now ${formatCash(state.runWinnings)}) to earn Blueprints. Elapsed run time ${formatDuration(state.playTimeMs)}.`,
    progress: Math.min(1, state.runWinnings / PRESTIGE_REQUIREMENT),
    action: {
      kind: 'buy',
      id: bestProgressTicket(state),
      label: `Buy ${getTicket(bestProgressTicket(state)).name}`,
    },
  };
}

/**
 * The most expensive affordable NON-risky ticket. Progression never requires a
 * ticket that can lose money.
 */
export function bestProgressTicket(state: GameState): string {
  const safe = availableTickets(state).filter((t) => !t.risky && t.cost <= state.cash);
  if (safe.length > 0) return safe.reduce((a, b) => (a.cost >= b.cost ? a : b)).id;
  const anySafe = availableTickets(state).filter((t) => !t.risky);
  return (anySafe[0] ?? availableTickets(state)[0]).id;
}

/** Progress toward the next collection, for the progress panel. */
export function collectionProgress(state: GameState) {
  return COLLECTIONS.map((collection) => {
    const unlocked = state.unlockedCollections.includes(collection.id);
    const byWinnings = collection.unlockWinnings > 0 ? state.runWinnings / collection.unlockWinnings : 1;
    const byCards = collection.unlockCards > 0 ? state.runCards / collection.unlockCards : 1;
    return {
      collection,
      unlocked,
      progress: unlocked ? 1 : Math.min(1, Math.max(byWinnings, byCards)),
    };
  });
}

export function ticketById(id: string) {
  return findTicket(id);
}
