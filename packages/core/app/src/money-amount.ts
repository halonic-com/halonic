// One money rule for the Studio and the command line (mc 15.2 revision 68,
// cli-output 3.4): two decimals, three below one cent, so a cheap run never
// reads as free and €0.004 and €0.009 don't look the same. An amount that
// rounds to a cent reads €0.01 (HAL-10646).

/** The currency a workspace's prices are in when it doesn't name one (`budget.currency`). */
export const defaultCurrency = "EUR";

/** From here up, three decimals would round to €0.010, so the amount reads €0.01. */
const threeDecimalsEnd = 0.0095;

/** How a tiny amount is introduced: "under €0.001" reads fine alone, "budget of less than €0.001" reads better after "of". */
export interface MoneyAmountOptions {
  readonly tiny?: "under" | "less than";
}

/**
 * An amount of money as a person reads it: two decimals, or three below one
 * cent, up to €0.0095: from there to a cent it reads €0.01, never "€0.010".
 * An amount above zero that would still read as 0.000 reads "under
 * €0.001". The currency is the workspace's (`budget.currency`, an ISO 4217
 * code); the symbol and its place come from English number formatting, so
 * every surface writes it the same way.
 *
 * An amount is a spend or a budget, so it is never negative. A negative or
 * non-finite amount is a bug in the caller, and throws rather than reading
 * "€-0.50" or "€NaN".
 *
 * Pass `{ tiny: "less than" }` where the amount follows "of" ("a budget of
 * less than €0.001"); the default is "under".
 *
 * @example
 * moneyAmount(5.08); // "€5.08"
 * moneyAmount(0.004); // "€0.004"
 * moneyAmount(0.0004); // "under €0.001"
 * moneyAmount(0.0004, "EUR", { tiny: "less than" }); // "less than €0.001"
 * moneyAmount(2, "USD"); // "$2.00"
 */
export function moneyAmount(
  amount: number,
  currency: string = defaultCurrency,
  options: MoneyAmountOptions = {},
): string {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`An amount of money must be zero or more, not ${amount}.`);
  }
  const decimals = amount > 0 && amount < threeDecimalsEnd ? 3 : 2;
  if (amount > 0 && amount.toFixed(3) === "0.000") {
    return `${options.tiny ?? "under"} ${inCurrency(0.001, currency, 3)}`;
  }
  return inCurrency(amount, currency, decimals);
}

function inCurrency(amount: number, currency: string, decimals: number): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}
