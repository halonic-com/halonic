import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";
import { isTextFile } from "../lib/source-files.ts";

/**
 * Characters that change what a text means or does without showing up in an
 * editor or a review diff: format characters (zero-width, bidi controls, tag
 * letters, the byte order mark), variation selectors, and control characters
 * other than tab, line feed and carriage return.
 */
const hidden =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: finding control characters is the point
  // biome-ignore lint/suspicious/noMisleadingCharacterClass: each listed character is matched on its own
  /[\p{Cf}\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu;

/**
 * An emoji with the joiners and presentation selectors that belong to it,
 * such as a warning sign shown as emoji, a family joined by zero-width
 * joiners, or a keycap digit. These are visible, so they stay allowed.
 */
const emojiSequence =
  /\p{Extended_Pictographic}(?:[\u{FE0E}\u{FE0F}]|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:[\u{FE0E}\u{FE0F}]|\p{Emoji_Modifier})?)*|[#*0-9]\u{FE0F}?\u20E3/gu;

/** One hidden character, with its 1-based line and column (in characters). */
export interface HiddenCharacter {
  readonly line: number;
  readonly column: number;
  readonly codePoint: number;
}

/**
 * Finds the hidden characters in a text. Joiners and selectors inside an
 * emoji don't count.
 *
 * @example
 * findHiddenCharacters("ok\nx\u202Ey");
 * // [{ line: 2, column: 2, codePoint: 0x202e }]
 */
export function findHiddenCharacters(text: string): HiddenCharacter[] {
  const found: HiddenCharacter[] = [];
  text.split("\n").forEach((line, index) => {
    const withoutEmoji = line.replace(emojiSequence, (emoji) =>
      emoji.replace(/[\u200D\u{FE0E}\u{FE0F}]/gu, "_"),
    );
    for (const match of withoutEmoji.matchAll(hidden)) {
      found.push({
        line: index + 1,
        column: [...withoutEmoji.slice(0, match.index)].length + 1,
        codePoint: match[0].codePointAt(0) ?? 0,
      });
    }
  });
  return found;
}

/** Names the kind of a hidden character in words, for the message. */
export function kindOf(codePoint: number): string {
  if (
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069) ||
    codePoint === 0x200e ||
    codePoint === 0x200f ||
    codePoint === 0x061c
  ) {
    return "a bidi control";
  }
  if (codePoint >= 0xe0000 && codePoint <= 0xe007f) {
    return "a tag character";
  }
  if ((codePoint >= 0xfe00 && codePoint <= 0xfe0f) || codePoint >= 0xe0100) {
    return "a variation selector";
  }
  if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
    return "a control character";
  }
  if (
    (codePoint >= 0x200b && codePoint <= 0x200d) ||
    codePoint === 0x2060 ||
    codePoint === 0xfeff
  ) {
    return "a zero-width character";
  }
  return "an invisible format character";
}

/** The escape for a character in TypeScript and JSON, such as `\u202E` or `\u{E0041}`. */
export function escapeFor(codePoint: number): string {
  const hex = codePoint.toString(16).toUpperCase().padStart(4, "0");
  return codePoint > 0xffff ? `\\u{${hex}}` : `\\u${hex}`;
}

/**
 * Fails on characters nobody can see in code, docs and config: zero-width
 * and bidi characters, tag letters, variation selectors and stray control
 * characters. They can hide text from a reviewer or make code read
 * differently from what it does. Visible non-ASCII, such as umlauts, CJK and
 * emoji, stays allowed. Tests are not exempt: a test that needs such a
 * character writes it as an escape.
 */
export function checkInvisibleCharacters(context: CheckContext): Report {
  const report = new Report("invisible-characters");
  for (const file of context.files) {
    if (!isTextFile(file)) {
      continue;
    }
    const byLine = Map.groupBy(findHiddenCharacters(context.read(file)), ({ line }) => line);
    for (const [line, characters] of byLine) {
      const [first, ...more] = characters as [HiddenCharacter, ...HiddenCharacter[]];
      const hex = first.codePoint.toString(16).toUpperCase().padStart(4, "0");
      const others = more.length === 0 ? "" : ` (and ${more.length} more on this line)`;
      report.error(
        file,
        `Column ${first.column} holds U+${hex}, ${kindOf(first.codePoint)} that can't be seen in an editor or a review${others}. In code, write it as an escape such as "${escapeFor(first.codePoint)}"; in docs, name it in words.`,
        line,
      );
    }
  }
  return report;
}
