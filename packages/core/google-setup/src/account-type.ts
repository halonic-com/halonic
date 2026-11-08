/**
 * The kind of Google account the setup is for. It decides how the project is
 * created (step 1), who may use the app (step 3) and what the user sees before
 * signing in (step 7). Design 2.3.
 */
export type AccountType = "workspace" | "personal";

/** Domains that only ever hold personal Google accounts. */
const personalDomains: ReadonlySet<string> = new Set(["gmail.com", "googlemail.com"]);

/**
 * Guesses the account type from the address, so Studio can prefill it. Only
 * Google's own consumer domains give an answer: any other domain can hold a
 * Workspace account or a personal one, so Studio has to ask.
 *
 * @param address - the Google account's e-mail address.
 * @returns `"personal"` for `@gmail.com` and `@googlemail.com`, otherwise
 *   `undefined`.
 *
 * @example
 * accountTypeFromAddress("someone@gmail.com"); // "personal"
 * accountTypeFromAddress("someone@example.com"); // undefined
 */
export function accountTypeFromAddress(address: string): AccountType | undefined {
  const at = address.lastIndexOf("@");
  if (at === -1) {
    return undefined;
  }
  const domain = address
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return personalDomains.has(domain) ? "personal" : undefined;
}
