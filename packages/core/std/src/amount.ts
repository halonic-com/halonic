const amountShape = /^(\d+)(?:[.,](\d+))?$/;

/**
 * Reads an amount the way someone writes it on a receipt: digits, and at
 * most one `.` or `,` before the decimals. No sign, no grouping, no
 * exponent. A single separator is always the decimal one, so `1,000` is 1.
 *
 * @param text - what the user typed; surrounding spaces are ignored
 * @returns the amount, or `undefined` for empty or anything else
 *
 * @example
 * parseAmount("15,00"); // 15
 * parseAmount("1.000,50"); // undefined
 */
export function parseAmount(text: string): number | undefined {
  const match = amountShape.exec(text.trim());
  if (match === null) {
    return undefined;
  }
  const [, whole, decimals] = match;
  const amount = Number(decimals === undefined ? whole : `${whole}.${decimals}`);
  return Number.isFinite(amount) ? amount : undefined;
}
