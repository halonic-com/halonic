/**
 * An amount in euros as the output writes it: two decimals, or three below a
 * cent, so a cheap run doesn't read as free. A spend above zero that would
 * still round to €0.000 reads "under €0.001" (cli-output 3.4, revision 25).
 *
 * An amount is a spend or a budget, so it is never negative. A negative or
 * non-finite amount is a bug in the caller, and throws rather than printing
 * "€-0.50" or "€NaN".
 *
 * @example
 * money(5.08); // "€5.08"
 * money(50); // "€50.00"
 * money(0.004); // "€0.004"
 * money(0.0004); // "under €0.001"
 */
export function money(euros: number): string {
  if (!Number.isFinite(euros) || euros < 0) {
    throw new RangeError(`An amount of money must be zero or more, not ${euros}.`);
  }
  const decimals = euros > 0 && euros < 0.01 ? 3 : 2;
  const amount = euros.toFixed(decimals);
  if (euros > 0 && amount === "0.000") {
    return "under €0.001";
  }
  return `€${amount}`;
}
