/**
 * Shared currency / number formatting.
 *
 * Every number shown in the interface must go through these helpers so the
 * player never sees two different formats for the same quantity.
 *
 * All money in Scratchworks is fictional "Workshop Credits" (¤).
 */

export const CURRENCY_SYMBOL = '¤';
export const CURRENCY_NAME = 'Workshop Credits';

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp'];

/**
 * Hard cap for any currency value. Ordinary JS doubles are used, so we keep
 * progression well inside the exactly-representable integer range
 * (2^53 ≈ 9.007e15). 1e15 leaves plenty of headroom for intermediate maths.
 */
export const MAX_CURRENCY = 1e15;

/** Clamps a value into a finite, non-NaN, bounded range. */
export function clampCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value > MAX_CURRENCY) return MAX_CURRENCY;
  if (value < -MAX_CURRENCY) return -MAX_CURRENCY;
  return value;
}

/** Rounds to cents to avoid long floating point tails in the UI and economy. */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/** Formats a bare number with K/M/B/T style suffixes. */
export function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '0';
  const sign = value < 0 ? '-' : '';
  let abs = Math.abs(value);
  if (abs < 1000) {
    const rounded = Math.round(abs * 100) / 100;
    const str =
      Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(rounded < 10 ? 2 : 1);
    return sign + str;
  }
  let tier = 0;
  while (abs >= 1000 && tier < SUFFIXES.length - 1) {
    abs /= 1000;
    tier++;
  }
  return `${sign}${abs.toFixed(abs < 10 ? decimals : abs < 100 ? 1 : 0)}${SUFFIXES[tier]}`;
}

/** Formats a money amount, including the fictional currency symbol. */
export function formatCash(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}${CURRENCY_SYMBOL}${formatNumber(Math.abs(value))}`;
}

/** Formats a signed money amount, always showing + or -. */
export function formatSignedCash(value: number): string {
  const sign = value < 0 ? '-' : '+';
  return `${sign}${CURRENCY_SYMBOL}${formatNumber(Math.abs(value))}`;
}

/** Formats a probability (0..1) as a percentage. */
export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '0%';
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Formats a multiplier such as 1.25 -> "×1.25". */
export function formatMultiplier(value: number, decimals = 2): string {
  return `×${value.toFixed(decimals)}`;
}

/** Formats a duration in milliseconds as a compact human readable string. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
