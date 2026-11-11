/** Everything that is not a digit, a dot, a comma or a minus sign: money symbols, codes and spaces. */
const NOT_PART_OF_A_NUMBER = /[^\d.,-]/g;

/** The digits after the last dot or comma, when nothing but digits follows it. */
const AFTER_LAST_SEPARATOR = /[.,](\d+)$/;

/** A whole part that is empty or only zeros, with an optional minus sign: no thousands group starts there. */
const NO_WHOLE_PART = /^-?0*$/;

const ANY_SEPARATOR = /[.,]/g;

/**
 * Reads a number from a value, so a guard can compare amounts written by
 * people or models.
 *
 * - A finite number is returned as it is.
 * - In a text, everything but digits, dots, commas and minus signs is dropped
 *   first, so `"EUR 1.250,00"` and `"€ 18.400"` work.
 * - The last dot or comma is the decimal separator when one or two digits, or
 *   four or more, follow it, so `"1,200.50"`, `"1.200,50"` and `"3.14159"` give
 *   1200.5, 1200.5 and 3.14159. A thousands group always has three digits.
 * - With exactly three digits after it, it separates thousands, so
 *   `"€ 18.400"` gives 18400 and `"1,234"` gives 1234. The exception is a whole
 *   part that is empty or only zeros: `"0.125"` and `".125"` give 0.125.
 * - Every other dot or comma separates thousands and is dropped.
 * - Anything else, including text without a digit, gives `null`.
 *
 * A lone `"1.234"` stays ambiguous and reads as 1234. A guard that compares
 * decimals with exactly three places after a non-zero whole part must not use
 * this rule.
 *
 * @example
 * toNumber("1.200,50"); // 1200.5
 * toNumber("1,200.50"); // 1200.5
 * toNumber("€ 18.400"); // 18400
 * toNumber("0.125"); // 0.125
 * toNumber("3.14159"); // 3.14159
 * toNumber("1.234"); // 1234, ambiguous: read as thousands
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
  const after = AFTER_LAST_SEPARATOR.exec(text);
  const places = after?.[1];
  if (!after || places === undefined) {
    return text.replace(ANY_SEPARATOR, "");
  }
  const wholePart = text.slice(0, after.index).replace(ANY_SEPARATOR, "");
  const isDecimal = places.length !== 3 || NO_WHOLE_PART.test(wholePart);
  return isDecimal ? `${wholePart}.${places}` : text.replace(ANY_SEPARATOR, "");
}
