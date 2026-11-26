// Claims are what an agent can write: payloads, comments, issue and PR text.
// They may only block. Keywords are matched after normalising, so a
// full-width, styled or zero-width-split word is still caught.

import { isHiddenCharacter } from "@halonicjs/std";

/**
 * A text in a form where lookalikes compare equal: hidden characters
 * (zero-width and control characters) removed, Unicode NFKC, then lower case.
 * NFKC folds full-width and mathematical letter forms into plain ones; it
 * does not fold letters of other scripts that only look alike.
 *
 * @example
 * normaliseClaim("Ｓｅ\u200bｃｒｅｔ"); // "secret"
 */
export function normaliseClaim(text: string): string {
  return withoutHidden(withoutHidden(text).normalize("NFKC")).toLowerCase();
}

function withoutHidden(text: string): string {
  let kept = "";
  for (const character of text) {
    if (!isHiddenCharacter(character.codePointAt(0) ?? 0)) kept += character;
  }
  return kept;
}

/**
 * Every string in a JSON value, keys included, so a keyword hidden in a
 * nested payload field or key is scanned too.
 */
export function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, inner]) => [key, ...stringsIn(inner)]);
  }
  return [];
}

/**
 * The first keyword found in any of the claims, or `undefined`. Keywords and
 * claims are both normalised with {@link normaliseClaim}.
 */
export function findKeyword(
  claims: readonly string[],
  keywords: readonly string[],
): string | undefined {
  const normalisedClaims = claims.map(normaliseClaim);
  return keywords.find((keyword) => {
    const wanted = normaliseClaim(keyword);
    return wanted.length > 0 && normalisedClaims.some((claim) => claim.includes(wanted));
  });
}
