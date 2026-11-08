/** Everything that is not a digit, a dot, a comma or a minus sign: money symbols, codes and spaces. */
const NOT_PART_OF_A_NUMBER = /[^\d.,-]/g;

/**
 * A dot or comma followed by one or two digits at the end: the decimal
 * separator. With three digits after it, it is a thousands separator instead.
 */
const DECIMAL_PART = /[.,](\d{1,2})$/;

const ANY_SEPARATOR = /[.,]/g;

/**
 * Reads a number from a value, so a guard can compare amounts written by
 * people or models.
 *
 * - A finite number is returned as it is.
 * - In a text, everything but digits, dots, commas and minus signs is dropped
 *   first, so `"EUR 1.250,00"` and `"€ 18.400"` work.
 * - The last dot or comma is the decimal separator when one or two digits
 *   follow it, so both `"1,200.50"` and `"1.200,50"` give 1200.5. Every other
 *   dot or comma separates thousands and is dropped.
 * - Anything else, including text without a digit, gives `null`.
 *
 * @example
 * toNumber("1.200,50"); // 1200.5
 * toNumber("1,200.50"); // 1200.5
 * toNumber("€ 18.400"); // 18400
 * toNumber("n/a"); // null
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const kept = value.replace(NOT_PART_OF_A_NUMBER, "");
  if (!/\d/.test(kept)) {
    return null;
  }
  const number = Number(withDotDecimal(kept));
  return Number.isFinite(number) ? number : null;
}

/** The text with the thousands separators dropped and the decimal separator, if any, as a dot. */
function withDotDecimal(text: string): string {
  const decimal = DECIMAL_PART.exec(text);
  if (!decimal) {
    return text.replace(ANY_SEPARATOR, "");
  }
  const wholePart = text.slice(0, decimal.index).replace(ANY_SEPARATOR, "");
  return `${wholePart}.${decimal[1]}`;
}
