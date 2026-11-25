// Cloud writes every amount as a decimal string, so no amount is ever a float on the way. This
// reads one into a whole number of the unit's smallest step from the string itself: going through
// `Number()` first would round "0.1" before it is scaled, and a large amount silently.

/** A decimal as Cloud writes it: digits, then optionally a point and more digits. */
const decimalPattern = /^([0-9]+)(?:\.([0-9]+))?$/;

/**
 * `text` times 10^`decimals` as a whole number, or `null` when it isn't a decimal string, has a
 * digit other than 0 past `decimals` places (it would have to be rounded), or doesn't fit in a safe
 * integer. Zeros past those places change nothing, so "20.000" reads as 20 with no decimals.
 */
export function scaledDecimal(text: unknown, decimals: number): number | null {
  if (typeof text !== "string") return null;
  const match = decimalPattern.exec(text);
  if (match === null) return null;
  const whole = match[1] ?? "";
  const fraction = match[2] ?? "";
  if (/[1-9]/.test(fraction.slice(decimals))) return null;
  const digits = whole + fraction.slice(0, decimals).padEnd(decimals, "0");
  const scaled = BigInt(digits);
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(scaled);
}
