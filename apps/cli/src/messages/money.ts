/**
 * An amount in euros as the output writes it: two decimals, or three below a
 * cent, so a cheap run doesn't read as free (cli-output 3.4's examples).
 *
 * @example
 * money(5.08); // "€5.08"
 * money(50); // "€50.00"
 * money(0.004); // "€0.004"
 */
export function money(euros: number): string {
  const decimals = euros > 0 && euros < 0.01 ? 3 : 2;
  return `€${euros.toFixed(decimals)}`;
}
