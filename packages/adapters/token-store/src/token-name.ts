/** The name rule of the `Secrets` port, which the `TokenStore` port shares. */
const namePattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
const maxNameLength = 128;

/**
 * The form a token name is stored under: lower case, with `-` turned into
 * `_`. Names that differ only in case or in `-` versus `_` are the same token.
 *
 * @throws RangeError when the name breaks the rule of the `Secrets` port
 *
 * @example
 * canonicalTokenName("Google-Refresh"); // "google_refresh"
 */
export function canonicalTokenName(name: string): string {
  if (name.length > maxNameLength || !namePattern.test(name)) {
    throw new RangeError(
      `"${name}" is not a token name. Use a letter, then letters, digits, "-" or "_", at most ${maxNameLength} characters.`,
    );
  }
  return name.toLowerCase().replaceAll("-", "_");
}
