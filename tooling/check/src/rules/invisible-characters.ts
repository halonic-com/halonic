import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";
import { isTextFile } from "../lib/source-files.ts";

/**
 * Characters that change what a text means or does without showing up in an
 * editor or a review diff: format characters (zero-width, bidi controls, tag
 * letters, the byte order mark), variation selectors, control characters
 * other than tab, line feed and carriage return, the line and paragraph
 * separators, and the Hangul fillers, which are letters that draw nothing and
 * so can make an invisible name.
 */
const hidden =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: finding control characters is the point
  // biome-ignore lint/suspicious/noMisleadingCharacterClass: each listed character is matched on its own
  /[\p{Cf}\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029\u115F\u1160\u3164\uFFA0]/gu;

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

/** The kinds of hidden character, in the order they are tried. */
const kinds: readonly (readonly [name: string, ranges: readonly (readonly [number, number])[]])[] =
  [
    [
      "a bidi control",
      [
        [0x202a, 0x202e],
        [0x2066, 0x2069],
        [0x200e, 0x200f],
        [0x061c, 0x061c],
      ],
    ],
    ["a tag character", [[0xe0000, 0xe007f]]],
    [
      "a variation selector",
      [
        [0xfe00, 0xfe0f],
        [0xe0100, Number.POSITIVE_INFINITY],
      ],
    ],
    [
      "a control character",
      [
        [0x00, 0x1f],
        [0x7f, 0x9f],
      ],
    ],
    [
      "a zero-width character",
      [
        [0x200b, 0x200d],
        [0x2060, 0x2060],
        [0xfeff, 0xfeff],
      ],
    ],
    ["a line or paragraph separator", [[0x2028, 0x2029]]],
    [
      "a Hangul filler",
      [
        [0x115f, 0x1160],
        [0x3164, 0x3164],
        [0xffa0, 0xffa0],
      ],
    ],
  ];

/** Names the kind of a hidden character in words, for the message. */
export function kindOf(codePoint: number): string {
  const kind = kinds.find(([, ranges]) =>
    ranges.some(([first, last]) => codePoint >= first && codePoint <= last),
  );
  return kind?.[0] ?? "an invisible format character";
}

/**
 * The escape for a character in the language of a file, such as `\u202E` or
 * `\u{E0041}` in TypeScript and JSON. Rust only knows the form with braces.
 */
export function escapeFor(codePoint: number, file = ""): string {
  const hex = codePoint.toString(16).toUpperCase().padStart(4, "0");
  const braces = codePoint > 0xffff || file.endsWith(".rs");
  return braces ? `\\u{${hex}}` : `\\u${hex}`;
}

/**
 * Fails on characters nobody can see in code, docs and config: zero-width
 * and bidi characters, tag letters, variation selectors, stray control
 * characters, line and paragraph separators and Hangul fillers. They can
 * hide text from a reviewer or make code read differently from what it does. Visible non-ASCII, such as umlauts, CJK and
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
        `Column ${first.column} holds U+${hex}, ${kindOf(first.codePoint)} that can't be seen in an editor or a review${others}. In code, write it as an escape such as "${escapeFor(first.codePoint, file)}"; in docs, name it in words.`,
        line,
      );
    }
  }
  return report;
}
