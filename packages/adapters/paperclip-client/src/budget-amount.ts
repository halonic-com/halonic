/** The Paperclip approval type that asks to raise a budget after a hard stop. */
export const budgetOverrideType = "budget_override_required";

/** The most cents Paperclip's resolve route takes: its amount is a 32-bit integer. */
const largestCents = 2_147_483_647;

/**
 * Plain dollars with up to two decimals, with or without a `$` in front and commas between
 * thousands, such as `250`, `$1,000` or `250.50`. A comma anywhere else is refused, so a
 * decimal comma (`250,50`) is never read as 25,050 dollars.
 */
const dollarsPattern = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

/**
 * The new limit the person wrote, in whole cents (`paperclip-client.budget-incidents`), or
 * `undefined` when it isn't an amount of dollars Paperclip can take: blank, not a number,
 * zero, or above Paperclip's limit.
 *
 * @example newLimitCents("$1,250.5"); // 125050
 */
export function newLimitCents(written: string | undefined): number | undefined {
  const match = dollarsPattern.exec((written ?? "").trim());
  if (match === null) {
    return undefined;
  }
  const whole = Number((match[1] ?? "").replaceAll(",", ""));
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const cents = whole * 100 + fraction;
  return Number.isSafeInteger(cents) && cents >= 1 && cents <= largestCents ? cents : undefined;
}
