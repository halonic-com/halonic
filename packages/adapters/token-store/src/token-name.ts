import { secretKey } from "@halonicjs/ports";

/**
 * The form a token name is stored under: lower case, with `-` turned into
 * `_`. Names that differ only in case or in `-` versus `_` are the same token.
 * The desktop shell stores keychain entries in this form too.
 *
 * @throws RangeError when the name breaks the rule of the `Secrets` port
 *
 * @example
 * canonicalTokenName("Google-Refresh"); // "google_refresh"
 */
export function canonicalTokenName(name: string): string {
  return secretKey(name).toLowerCase();
}
