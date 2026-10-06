/**
 * Seeded economy simulation for Scratchworks.
 *
 * Run with:  npm run simulate
 *
 * Simulates two strategies with a deterministic RNG, reports time to each
 * milestone, expected returns per ticket and luck level, and flags cash
 * starvation or progression stalls.
 */
import { COLLECTIONS, TICKETS, getTicket } from '../src/game/data/tickets';
import {
  PRESTIGE_REQUIREMENT,
  RUN_UPGRADES,
  upgradeCost,
} from '../src/game/data/upgrades';
import { tick } from '../src/game/automation';
import { buyCard, buyRunUpgrade, claimCard, discardCard, revealCard, workshopJob } from '../src/game/economy';
import { formatCash, formatDuration } from '../src/game/format';
import { analyzeTicket } from '../src/game/payout';
import { availableTickets, createInitialState, queueCapacity } from '../src/game/state';
import { blueprintAward } from '../src/game/data/upgrades';
import type { GameState } from '../src/game/types';

const STEP_MS = 100;
const MAX_MS = 60 * 60 * 1000;

interface Milestones {
  firstUpgrade?: number;
  firstAutomation?: number;
  secondCollection?: number;
  thirdCollection?: number;
  fourthCollection?: number;
  prestige?: number;
}

interface SimResult {
  label: string;
  seed: number;
  milestones: Milestones;
  endCash: number;
  endWinnings: number;
  cards: number;
  starvationMs: number;
  blueprints: number;
}

/** Highest-cost non-risky ticket the player can comfortably afford. */
function pickTicket(state: GameState): string {
  const safe = availableTickets(state).filter((t) => !t.risky);
  let best = safe[0];
  for (const t of safe) {
    if (t.cost <= state.cash * 0.2) best = t;
  }
  return best.id;
}

/** Simple upgrade policy: automation first, then luck, then rack. */
function buyUpgrades(state: GameState): void {
  const order = ['scratcher', 'collector', 'buyer', 'luck', 'rack', 'job'];
  let bought = true;
  let guard = 0;
  while (bought && guard++ < 50) {
    bought = false;
    for (const id of order) {
      const def = RUN_UPGRADES.find((u) => u.id === id);
      if (!def) continue;
      const level = state.upgrades[id] ?? 0;
      if (level >= def.maxLevel) continue;
      const cost = upgradeCost(def, level);
      // Never spend more than 60% of cash on a single upgrade.
      if (cost > state.cash * 0.5) continue;
      if (id === 'luck' && level >= 20) continue;
      if (buyRunUpgrade(state, id).ok) bought = true;
    }
  }
}

function simulate(label: string, seed: number, automated: boolean): SimResult {
  const state = createInitialState({ now: 0, seed });
  state.settings.autoBuyQueueLimit = 12;
  const milestones: Milestones = {};
  let elapsed = 0;
  let starvationMs = 0;

  while (elapsed < MAX_MS) {
    // --- player decisions ---
    state.selectedTicketId = pickTicket(state);
    if (automated) buyUpgrades(state);
    else if ((state.upgrades.luck ?? 0) < 10) buyUpgrades(state);

    // Manual play: buy, reveal, claim by hand (the conservative strategy also
    // uses automation once it can afford it, but scratches by hand meanwhile).
    // A human can realistically buy about two cards per second.
    const cap = queueCapacity(state);
    const cost = getTicket(state.selectedTicketId).cost;
    const queued = state.cards.filter(
      (c) => c.status !== 'claimed' && c.status !== 'discarded',
    ).length;
    if (elapsed % 500 === 0 && queued < cap && state.cash >= cost * 2) {
      buyCard(state, state.selectedTicketId);
    }
    // Manual scratching: a human reveals roughly 1 card every 2 seconds.
    if (elapsed % 2000 === 0) {
      const target = state.cards.find((c) => c.status === 'unrevealed');
      if (target) revealCard(state, target.id);
    }
    for (const card of state.cards) {
      if (card.status === 'revealed' || card.status === 'held') {
        if (card.payout < 0) discardCard(state, card.id);
        else claimCard(state, card.id);
      }
    }
    // The Workshop job is free money and is always worth taking when short.
    if (state.cash < cost * 3) workshopJob(state);
    if (state.cash < cost) starvationMs += STEP_MS;

    tick(state, STEP_MS);
    elapsed += STEP_MS;

    // --- milestone capture ---
    const upgradeLevels = Object.values(state.upgrades).reduce((a, b) => a + b, 0);
    if (milestones.firstUpgrade === undefined && upgradeLevels > 0) milestones.firstUpgrade = elapsed;
    if (
      milestones.firstAutomation === undefined &&
      (state.upgrades.buyer ?? 0) + (state.upgrades.scratcher ?? 0) + (state.upgrades.collector ?? 0) > 0
    ) {
      milestones.firstAutomation = elapsed;
    }
    if (milestones.secondCollection === undefined && state.unlockedCollections.length >= 2)
      milestones.secondCollection = elapsed;
    if (milestones.thirdCollection === undefined && state.unlockedCollections.length >= 3)
      milestones.thirdCollection = elapsed;
    if (milestones.fourthCollection === undefined && state.unlockedCollections.length >= 4)
      milestones.fourthCollection = elapsed;
    if (milestones.prestige === undefined && state.runWinnings >= PRESTIGE_REQUIREMENT) {
      milestones.prestige = elapsed;
      break;
    }
  }

  return {
    label,
    seed,
    milestones,
    endCash: state.cash,
    endWinnings: state.runWinnings,
    cards: state.runCards,
    starvationMs,
    blueprints: blueprintAward(state),
  };
}

function ms(value?: number): string {
  return value === undefined ? 'not reached' : formatDuration(value);
}

function report(results: SimResult[]): void {
  for (const r of results) {
    console.log(`\n── ${r.label} (seed ${r.seed}) ──`);
    console.log(`  first upgrade      : ${ms(r.milestones.firstUpgrade)}`);
    console.log(`  first automation   : ${ms(r.milestones.firstAutomation)}`);
    console.log(`  2nd collection     : ${ms(r.milestones.secondCollection)}`);
    console.log(`  3rd collection     : ${ms(r.milestones.thirdCollection)}`);
    console.log(`  4th collection     : ${ms(r.milestones.fourthCollection)}`);
    console.log(`  first prestige     : ${ms(r.milestones.prestige)}`);
    console.log(`  cards completed    : ${r.cards}`);
    console.log(`  run winnings       : ${formatCash(r.endWinnings)}`);
    console.log(`  cash at end        : ${formatCash(r.endCash)}`);
    console.log(`  cash starvation    : ${formatDuration(r.starvationMs)}`);
    console.log(`  blueprints if now  : ${r.blueprints}`);
    if (r.starvationMs > 60000) console.log('  ⚠ cash starvation exceeded one minute');
    if (r.milestones.prestige === undefined) console.log('  ⚠ prestige not reached within 90 minutes');
  }
}

function expectedReturnTable(): void {
  console.log('\n── Expected return by ticket and luck level (exact) ──');
  console.log('ticket                luck  return  P(loss)  P(zero)  E[net]');
  for (const ticket of TICKETS) {
    for (const luck of [0, 5, 10, 15, 20, 25, 30]) {
      const a = analyzeTicket(ticket, luck);
      const capped = luck > ticket.luckCap ? ' (capped)' : '';
      console.log(
        `${ticket.id.padEnd(20)} ${String(luck).padStart(4)}  ${a.returnRatio.toFixed(3)}  ` +
          `${(a.probabilityLoss * 100).toFixed(1).padStart(6)}%  ${(a.probabilityZero * 100).toFixed(1).padStart(6)}%  ` +
          `${formatCash(a.expectedNet).padStart(10)}${capped}`,
      );
    }
  }
}

function collectionTable(): void {
  console.log('\n── Collections ──');
  for (const c of COLLECTIONS) {
    const costs = TICKETS.filter((t) => t.collectionId === c.id)
      .map((t) => `${t.name} ${formatCash(t.cost)}`)
      .join(', ');
    console.log(`${c.name.padEnd(20)} unlock: ${formatCash(c.unlockWinnings)} or ${c.unlockCards} cards | ${costs}`);
  }
}

const results = [
  simulate('Conservative manual play', 12345, false),
  simulate('Automation-focused play', 12345, true),
  simulate('Automation-focused play', 777, true),
];

collectionTable();
expectedReturnTable();
report(results);
console.log('\nTargets: first upgrade 30–60s · first automation 3–5min · 2nd collection 5–10min · first prestige 20–30min');
