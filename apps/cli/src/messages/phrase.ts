import { type Mark, markText, type Paint } from "../output/paint.ts";

/** A piece of a {@link Phrase}: plain text, text with emphasis, a mark such as › in "Settings › Models", or padding. */
export type Part =
  | string
  | { readonly text: string; readonly emphasis: "bold" | "dim" }
  | { readonly mark: Mark }
  | { readonly padding: Padding };

/**
 * Spaces that line up a column. A mark's stand-in can be wider than the mark
 * itself (`ok` for ✓), so the number of spaces depends on whether the stream
 * shows the Unicode marks. `columns` in `columns.ts` works both out.
 */
export interface Padding {
  /** How many spaces in a stream that shows the Unicode marks, and in JSON. */
  readonly unicode: number;
  /** How many spaces in a stream that shows the ASCII stand-ins. */
  readonly ascii: number;
}

/**
 * A sentence the user reads, kept in parts so a terminal can show its one
 * important name in bold and its secondary text dimmed, while JSON and a pipe
 * get the same words without any styling.
 */
export type Phrase = readonly Part[];

/** What a {@link phrase} template may hold: text, a number, a part, or another phrase. */
export type PhraseValue = string | number | Part | Phrase;

/**
 * Builds a {@link Phrase} from a template, so a catalogue entry reads like the sentence it is.
 *
 * @example
 * phrase`Wrote ${12} JSON Schemas to ${dim("./schemas")}.`;
 */
export function phrase(strings: TemplateStringsArray, ...values: readonly PhraseValue[]): Phrase {
  const parts: Part[] = [];
  strings.forEach((text, index) => {
    pushText(parts, text);
    const value = values[index];
    if (value !== undefined) {
      pushValue(parts, value);
    }
  });
  return parts;
}

/** The one name or number on a line that matters. */
export function bold(text: string): Part {
  return { text, emphasis: "bold" };
}

/** Secondary text: a path, a duration, a code or a hint. */
export function dim(text: string): Part {
  return { text, emphasis: "dim" };
}

/**
 * The whole phrase as secondary text, such as the list's When column: its
 * texts dimmed, its marks kept.
 */
export function dimmed(value: Phrase): Phrase {
  return value.map((part) => {
    if (typeof part === "string") {
      return dim(part);
    }
    return "text" in part ? dim(part.text) : part;
  });
}

/** A mark inside a sentence, such as the › between Studio places. */
export function markPart(mark: Mark): Part {
  return { mark };
}

/**
 * Facts joined with the separator mark, as a step's facts and the receipt
 * show them: "Writer · smart".
 */
export function joinedFacts(facts: readonly string[]): Phrase {
  return facts.flatMap((fact, index) =>
    index === 0 ? [fact] : [" ", markPart("separator"), " ", fact],
  );
}

/**
 * A line made of facts, such as the receipt or the ✓ Done row of `halonic
 * runs`: joined as {@link joinedFacts} does, with a capital on the first,
 * whatever it is. Empty for no facts.
 *
 * @example
 * plainText(lineOfFacts(["sent nothing", "asked you once"])); // "Sent nothing · asked you once"
 */
export function lineOfFacts(facts: readonly string[]): Phrase {
  const [first, ...rest] = facts;
  if (first === undefined) {
    return [];
  }
  return joinedFacts([first.charAt(0).toUpperCase() + first.slice(1), ...rest]);
}

/** The phrase as a stream with `paint` shows it. */
export function renderPhrase(value: Phrase, paint: Paint): string {
  return value
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if ("mark" in part) {
        return paint.mark(part.mark);
      }
      if ("padding" in part) {
        return paddingText(part.padding, paint.unicode);
      }
      return part.emphasis === "bold" ? paint.bold(part.text) : paint.dim(part.text);
    })
    .join("");
}

/** The phrase's words with no styling and the Unicode marks, as `--json` and tests use them. */
export function plainText(value: Phrase): string {
  return value
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      // JSON is always UTF-8, so its text keeps the real marks whatever the terminal can show.
      return partText(part, true);
    })
    .join("");
}

/**
 * The phrase cut to at most `width` characters as a stream shows them, ending
 * in "…" (or "..." when the stream isn't UTF-8) when it had to be cut. A phrase
 * that fits comes back unchanged. A mark is never cut in half: one that
 * doesn't fit whole is left out with the rest.
 *
 * @param width - how many characters the stream has room for
 * @param unicode - whether the stream shows the Unicode marks (the style's `unicode`)
 */
export function fitPhrase(value: Phrase, width: number, unicode: boolean): Phrase {
  if (visibleLength(value, unicode) <= width) {
    return value;
  }
  const ellipsis = unicode ? "…" : "...";
  let room = Math.max(0, width - ellipsis.length);
  const parts: Part[] = [];
  for (const part of value) {
    const text = partText(part, unicode);
    if (characters(text).length <= room) {
      parts.push(part);
      room -= characters(text).length;
      continue;
    }
    if (typeof part === "string") {
      pushText(parts, characters(part).slice(0, room).join(""));
    } else if ("text" in part && room > 0) {
      parts.push({ ...part, text: characters(part.text).slice(0, room).join("") });
    }
    break;
  }
  pushText(parts, ellipsis);
  return parts;
}

/**
 * How many characters the phrase takes in a stream that shows the Unicode
 * marks, or their ASCII stand-ins: what a column has to make room for.
 */
export function visibleLength(value: Phrase, unicode: boolean): number {
  return value.reduce((length, part) => length + characters(partText(part, unicode)).length, 0);
}

function partText(part: Part, unicode: boolean): string {
  if (typeof part === "string") {
    return part;
  }
  if ("mark" in part) {
    return markText(part.mark, unicode);
  }
  return "padding" in part ? paddingText(part.padding, unicode) : part.text;
}

function paddingText(padding: Padding, unicode: boolean): string {
  return " ".repeat(unicode ? padding.unicode : padding.ascii);
}

/** The text as the characters a terminal shows, so "◌" counts as one, not as its UTF-16 units. */
function characters(text: string): string[] {
  return [...text];
}

function pushValue(parts: Part[], value: PhraseValue): void {
  if (typeof value === "number") {
    pushText(parts, String(value));
  } else if (Array.isArray(value)) {
    for (const part of value as Phrase) {
      pushValue(parts, part);
    }
  } else if (typeof value === "string") {
    pushText(parts, value);
  } else {
    parts.push(value as Part);
  }
}

/** Adds text, joining it to plain text before it so a phrase has as few parts as it needs. */
function pushText(parts: Part[], text: string): void {
  if (text === "") {
    return;
  }
  const last = parts.at(-1);
  if (typeof last === "string") {
    parts[parts.length - 1] = last + text;
  } else {
    parts.push(text);
  }
}
