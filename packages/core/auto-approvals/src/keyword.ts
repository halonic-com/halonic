import { isHiddenCharacter } from "@halonicjs/std";

/**
 * Text in the form keywords are compared in (design section 4, rule 3): Unicode
 * NFKC, so full-width and other compatibility lookalikes become plain letters,
 * then lower case, with hidden characters such as zero-width spaces removed.
 *
 * @example
 * normaliseForKeywords("ＳＥＣ\u200bＲＥＴ"); // "secret"
 */
export function normaliseForKeywords(text: string): string {
  let visible = "";
  for (const character of text.normalize("NFKC")) {
    if (!isHiddenCharacter(character.codePointAt(0) ?? 0)) visible += character;
  }
  return visible.toLowerCase();
}

/**
 * The keywords found in any of `texts`, in the order of `keywords`. Both sides
 * are normalised first, so a keyword hidden behind lookalike characters still matches.
 */
export function findKeywords(keywords: readonly string[], texts: readonly string[]): string[] {
  const haystack = texts.map(normaliseForKeywords);
  return keywords.filter((keyword) => {
    const needle = normaliseForKeywords(keyword);
    return haystack.some((text) => text.includes(needle));
  });
}
