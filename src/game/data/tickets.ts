import type { CollectionDef, SymbolDef, TicketDef } from '../types';

/**
 * ───────────────────────────────────────────────────────────────────────────
 *  BALANCING CONFIGURATION — TICKETS
 * ───────────────────────────────────────────────────────────────────────────
 * Every ticket is described purely by data: cost, symbol weights, symbol
 * values and a luck cap. Payouts are always derived from the symbols that were
 * generated at purchase time (see payout.ts), never rolled separately.
 *
 * `value` units are multiples of the ticket cost, so a whole collection can be
 * rescaled by changing only its ticket costs.
 */

/** Match Three: payout multiplier applied to a group of N identical symbols. */
export const MATCH_GROUP_MULTIPLIER: Record<number, number> = {
  3: 1,
  4: 2.5,
  5: 6,
  6: 15,
  7: 28,
  8: 70,
  9: 160,
};

/** Global scale knob used when tuning Match Three expected return. */
export const MATCH3_VALUE_SCALE = 0.658;

export const COLLECTIONS: CollectionDef[] = [
  {
    id: 'bench',
    name: 'Bench Basics',
    tagline: 'Offcuts, bolts and the smell of sawdust.',
    unlockWinnings: 0,
    unlockCards: 0,
    accent: '#d9a441',
  },
  {
    id: 'copper',
    name: 'Copper Foundry',
    tagline: 'Hot metal, bright seams, bigger stakes.',
    unlockWinnings: 1000,
    unlockCards: 180,
    accent: '#c97b4a',
  },
  {
    id: 'clockwork',
    name: 'Clockwork Atelier',
    tagline: 'Escapements, mainsprings and very fine tolerances.',
    unlockWinnings: 10000,
    unlockCards: 700,
    accent: '#7fa6c9',
  },
  {
    id: 'aurora',
    name: 'Aurora Forge',
    tagline: 'Light bent into shape by patient hands.',
    unlockWinnings: 100000,
    unlockCards: 2000,
    accent: '#9b7fd4',
  },
];

interface CollectionTuning {
  id: string;
  luckCap: number;
  riskyLuckCap: number;
  costs: { match3: number; trail: number; garden: number };
  names: { match3: string; trail: string; garden: string };
  glyphs: { match: string[]; trail: string[]; garden: string[] };
  labels: { match: string[]; trail: string[]; garden: string[] };
}

const TUNING: CollectionTuning[] = [
  {
    id: 'bench',
    luckCap: 8,
    riskyLuckCap: 6,
    costs: { match3: 1, trail: 2, garden: 4 },
    names: { match3: 'Bolt Match', trail: 'Toolbox Trail', garden: 'Sprout Plot' },
    glyphs: {
      match: ['·', '⬡', '✦', '◈', '❖'],
      trail: ['·', '◦', '○', '◉', '⬤', '»', '≫'],
      garden: ['·', '🌱', '🌼', '🏅', '🐛', '🍂', '🦗'],
    },
    labels: {
      match: ['Sawdust', 'Bolt', 'Gear', 'Lantern', 'Prism'],
      trail: ['Empty Slot', 'Chip', 'Washer', 'Ingot', 'Tool Vault', 'Twin Rail', 'Triple Rail'],
      garden: ['Bare Soil', 'Sprout', 'Bloom', 'Golden Gourd', 'Aphid', 'Blight', 'Locust'],
    },
  },
  {
    id: 'copper',
    luckCap: 14,
    riskyLuckCap: 10,
    costs: { match3: 15, trail: 30, garden: 55 },
    names: { match3: 'Rivet Rows', trail: 'Pipeline Run', garden: 'Copper Greenhouse' },
    glyphs: {
      match: ['·', '⬡', '✦', '◈', '❖'],
      trail: ['·', '◦', '○', '◉', '⬤', '»', '≫'],
      garden: ['·', '🌱', '🌼', '🏅', '🐛', '🍂', '🦗'],
    },
    labels: {
      match: ['Slag', 'Rivet', 'Coil', 'Crucible', 'Ember Prism'],
      trail: ['Cold Pipe', 'Droplet', 'Nugget', 'Billet', 'Foundry Vault', 'Twin Flue', 'Triple Flue'],
      garden: ['Dry Bed', 'Copper Vine', 'Verdigris Bloom', 'Brass Melon', 'Rust Mite', 'Scorch', 'Swarm'],
    },
  },
  {
    id: 'clockwork',
    luckCap: 20,
    riskyLuckCap: 14,
    costs: { match3: 220, trail: 450, garden: 800 },
    names: { match3: 'Escapement Trio', trail: 'Mainspring Trail', garden: 'Botanic Gearworks' },
    glyphs: {
      match: ['·', '⬡', '✦', '◈', '❖'],
      trail: ['·', '◦', '○', '◉', '⬤', '»', '≫'],
      garden: ['·', '🌱', '🌼', '🏅', '🐛', '🍂', '🦗'],
    },
    labels: {
      match: ['Dust Cap', 'Pallet Fork', 'Balance Wheel', 'Tourbillon', 'Moon Prism'],
      trail: ['Slack Coil', 'Jewel', 'Pinion', 'Mainspring', 'Atelier Vault', 'Twin Train', 'Triple Train'],
      garden: ['Idle Bed', 'Brass Shoot', 'Enamel Bloom', 'Orrery Fruit', 'Cog Weevil', 'Oil Rot', 'Spring Swarm'],
    },
  },
  {
    id: 'aurora',
    luckCap: 26,
    riskyLuckCap: 18,
    costs: { match3: 3000, trail: 6000, garden: 11000 },
    names: { match3: 'Prism Triad', trail: 'Aurora Conduit', garden: 'Starlight Orchard' },
    glyphs: {
      match: ['·', '⬡', '✦', '◈', '❖'],
      trail: ['·', '◦', '○', '◉', '⬤', '»', '≫'],
      garden: ['·', '🌱', '🌼', '🏅', '🐛', '🍂', '🦗'],
    },
    labels: {
      match: ['Night Dust', 'Spark', 'Halo Ring', 'Lumen Core', 'Aurora Prism'],
      trail: ['Dark Span', 'Mote', 'Filament', 'Lumen Cell', 'Forge Vault', 'Twin Arc', 'Triple Arc'],
      garden: ['Void Bed', 'Glow Shoot', 'Nebula Bloom', 'Sunfruit', 'Void Mite', 'Frost Burn', 'Star Locust'],
    },
  },
];

/** Match Three symbol template: weight + three-of-a-kind value (×cost). */
const MATCH_TEMPLATE = [
  { weight: 50, value: 0, role: 'blank' as const, affinity: 0 as const },
  { weight: 25, value: 0.95, role: 'match' as const, affinity: 1 as const },
  { weight: 14, value: 3.2, role: 'match' as const, affinity: 1 as const },
  { weight: 8, value: 11, role: 'match' as const, affinity: 1 as const },
  { weight: 3, value: 90, role: 'match' as const, affinity: 1 as const, jackpot: true },
];

/** Treasure Trail template: coins add, multipliers multiply the whole trail. */
const TRAIL_TEMPLATE = [
  { weight: 35, value: 0, role: 'blank' as const, affinity: 0 as const },
  { weight: 30, value: 0.082, role: 'coin' as const, affinity: 1 as const },
  { weight: 18, value: 0.185, role: 'coin' as const, affinity: 1 as const },
  { weight: 7, value: 0.494, role: 'coin' as const, affinity: 1 as const },
  { weight: 1, value: 4.6, role: 'coin' as const, affinity: 1 as const, jackpot: true },
  { weight: 7, value: 2, role: 'mult' as const, affinity: 1 as const },
  { weight: 2, value: 3, role: 'mult' as const, affinity: 1 as const },
];

/** Garden Harvest template: signed values, pests subtract. */
const GARDEN_TEMPLATE = [
  { weight: 30, value: 0, role: 'blank' as const, affinity: 0 as const },
  { weight: 25, value: 0.56, role: 'reward' as const, affinity: 1 as const },
  { weight: 15, value: 1.69, role: 'reward' as const, affinity: 1 as const },
  { weight: 5, value: 7.05, role: 'reward' as const, affinity: 1 as const, jackpot: true },
  { weight: 15, value: -1.2, role: 'pest' as const, affinity: -1 as const },
  { weight: 8, value: -2.7, role: 'pest' as const, affinity: -1 as const },
  { weight: 2, value: -6, role: 'pest' as const, affinity: -1 as const },
];

function describeMatch(value: number): string {
  return value <= 0
    ? 'No value. Pads the grid.'
    : `Three of these pay ×${value} the ticket cost; larger groups pay much more.`;
}

function describeTrail(role: string, value: number): string {
  if (role === 'blank') return 'An empty space. Adds nothing, costs nothing.';
  if (role === 'mult') return `Multiplies the whole trail total by ×${value}.`;
  return `Adds ×${value} of the ticket cost to the trail total.`;
}

function describeGarden(value: number): string {
  if (value === 0) return 'Nothing grew here. No effect.';
  if (value > 0) return `Adds ×${value} of the ticket cost to the harvest.`;
  return `A pest. Subtracts ×${Math.abs(value)} of the ticket cost from the harvest.`;
}

function buildSymbols(kind: 'match3' | 'trail' | 'garden', tuning: CollectionTuning): SymbolDef[] {
  if (kind === 'match3') {
    return MATCH_TEMPLATE.map((t, i) => ({
      id: `m${i}`,
      label: tuning.labels.match[i],
      glyph: tuning.glyphs.match[i],
      weight: t.weight,
      luckAffinity: t.affinity,
      value: t.value * MATCH3_VALUE_SCALE,
      role: t.role,
      jackpot: t.jackpot,
      description: describeMatch(t.value * MATCH3_VALUE_SCALE),
    }));
  }
  if (kind === 'trail') {
    return TRAIL_TEMPLATE.map((t, i) => ({
      id: `t${i}`,
      label: tuning.labels.trail[i],
      glyph: tuning.glyphs.trail[i],
      weight: t.weight,
      luckAffinity: t.affinity,
      value: t.value,
      role: t.role,
      jackpot: t.jackpot,
      description: describeTrail(t.role, t.value),
    }));
  }
  return GARDEN_TEMPLATE.map((t, i) => ({
    id: `g${i}`,
    label: tuning.labels.garden[i],
    glyph: tuning.glyphs.garden[i],
    weight: t.weight,
    luckAffinity: t.affinity,
    value: t.value,
    role: t.role,
    jackpot: t.jackpot,
    description: describeGarden(t.value),
  }));
}

const MATCH_RULES = [
  'Scratch all nine spaces to reveal a 3×3 grid.',
  'Matches count ANYWHERE on the grid — position and lines do not matter.',
  'Every symbol appearing three or more times pays out, and multiple winning groups are added together.',
  'Bigger groups multiply that symbol’s value: 3→×1, 4→×2.5, 5→×6, 6→×15, 7→×40, 8→×100, 9→×250.',
  'This ticket can never pay less than ¤0.',
];

const TRAIL_RULES = [
  'Scratch six spaces along the trail.',
  'Payout = (sum of all coin values) × (product of all multiplier spaces) × ticket cost.',
  'Spaces with no coin and no multiplier simply add nothing.',
  'There are no hidden penalties: this ticket can never pay less than ¤0.',
];

const GARDEN_RULES = [
  'HIGH RISK. Scratch five plots.',
  'Payout = (sum of every reward value − sum of every pest value) × ticket cost.',
  'A bad harvest produces a NEGATIVE card which costs you money if you claim it.',
  'You may always discard a revealed card instead of claiming it (the ticket cost is not refunded).',
  'Losses are capped at your available cash — your balance can never go below ¤0.',
];

function buildTicket(kind: 'match3' | 'trail' | 'garden', tuning: CollectionTuning): TicketDef {
  const cells = kind === 'match3' ? 9 : kind === 'trail' ? 6 : 5;
  return {
    id: `${tuning.id}-${kind}`,
    name: tuning.names[kind],
    kind,
    collectionId: tuning.id,
    cost: tuning.costs[kind],
    cells,
    symbols: buildSymbols(kind, tuning),
    luckCap: kind === 'garden' ? tuning.riskyLuckCap : tuning.luckCap,
    risky: kind === 'garden',
    rules: kind === 'match3' ? MATCH_RULES : kind === 'trail' ? TRAIL_RULES : GARDEN_RULES,
  };
}

export const TICKETS: TicketDef[] = TUNING.flatMap((t) => [
  buildTicket('match3', t),
  buildTicket('trail', t),
  buildTicket('garden', t),
]);

const TICKET_INDEX = new Map(TICKETS.map((t) => [t.id, t]));

export function getTicket(id: string): TicketDef {
  const ticket = TICKET_INDEX.get(id);
  if (!ticket) throw new Error(`Unknown ticket: ${id}`);
  return ticket;
}

export function findTicket(id: string): TicketDef | undefined {
  return TICKET_INDEX.get(id);
}

export function getCollection(id: string): CollectionDef {
  const c = COLLECTIONS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown collection: ${id}`);
  return c;
}

export function ticketsInCollection(collectionId: string): TicketDef[] {
  return TICKETS.filter((t) => t.collectionId === collectionId);
}

export const DEFAULT_TICKET_ID = TICKETS[0].id;
