/**
 * The code point ranges a text can carry without anyone seeing them: control
 * characters other than tab (U+0009) and newline (U+000A), the soft hyphen,
 * zero-width characters, direction marks, overrides and isolates, the word
 * joiner and invisible operators, the byte order mark and Unicode tag
 * characters. Written as numbers, so the source holds no invisible character
 * itself.
 */
const hiddenRanges: readonly (readonly [number, number])[] = [
  [0x0000, 0x0008],
  [0x000b, 0x001f],
  [0x007f, 0x009f],
  [0x00ad, 0x00ad],
  [0x061c, 0x061c],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
  [0xe0000, 0xe007f],
];

/**
 * Whether a code point is one nobody sees on screen but that can still change
 * the text around it, such as a right-to-left override.
 *
 * @example
 * isHiddenCharacter(0x202e); // true
 * isHiddenCharacter("a".codePointAt(0) ?? 0); // false
 */
export function isHiddenCharacter(codePoint: number): boolean {
  return hiddenRanges.some(([first, last]) => codePoint >= first && codePoint <= last);
}

/**
 * JSON text with every hidden character written as a `\uXXXX` escape, so the
 * raw JSON shows it too and stays the same JSON. A character above U+FFFF,
 * such as a tag character, becomes its two UTF-16 escapes. Hidden characters
 * can only stand inside JSON strings, where an escape means the same.
 *
 * @example
 * escapeHidden(JSON.stringify(`Refund${String.fromCodePoint(0x202e)}for Sam`)); // '"Refund\\u202efor Sam"'
 */
export function escapeHidden(json: string): string {
  let escaped = "";
  for (const character of json) {
    if (!isHiddenCharacter(character.codePointAt(0) ?? 0)) {
      escaped += character;
      continue;
    }
    for (let index = 0; index < character.length; index++) {
      escaped += `\\u${character.charCodeAt(index).toString(16).padStart(4, "0")}`;
    }
  }
  return escaped;
}
