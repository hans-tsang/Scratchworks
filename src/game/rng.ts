/**
 * Seeded pseudo random number generator.
 *
 * The whole game logic takes an `Rng` as a parameter so that tests and the
 * balance simulator can produce deterministic, reproducible runs.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Current internal state, so it can be persisted/restored. */
  getState(): number;
  setState(state: number): void;
}

/** mulberry32 — small, fast, good enough statistical quality for a game. */
export function createRng(seed: number): Rng {
  let s = (seed >>> 0) || 0x9e3779b9;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    getState() {
      return s;
    },
    setState(state: number) {
      s = state >>> 0;
    },
  };
}

/** Turns an arbitrary string into a 32 bit seed. */
export function seedFromString(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Picks an index from a list of non-negative weights.
 * Returns the last index if floating point drift leaves a remainder.
 */
export function weightedIndex(weights: readonly number[], rng: Rng): number {
  let total = 0;
  for (const w of weights) total += w > 0 ? w : 0;
  if (total <= 0) return 0;
  let roll = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] > 0 ? weights[i] : 0;
    roll -= w;
    if (roll < 0) return i;
  }
  return weights.length - 1;
}
