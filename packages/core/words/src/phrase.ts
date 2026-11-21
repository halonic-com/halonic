/**
 * The marks a line can start with or use inside it (cli-output 1.4). A
 * phrase names the mark; the face that draws it picks its look: the CLI its
 * colour or ASCII stand-in, Studio its icon.
 */
export type Mark = "done" | "failed" | "needsYou" | "working" | "separator" | "studioPath";

/** Each mark as Unicode text, as JSON and a UTF-8 terminal show it. */
const glyphs: Readonly<Record<Mark, string>> = {
  done: "✓",
  failed: "✕",
  needsYou: "!",
  working: "◌",
  separator: "·",
  studioPath: "›",
};

/**
 * The mark as Unicode text.
 *
 * @example
 * markGlyph("separator"); // "·"
 */
export function markGlyph(mark: Mark): string {
  return glyphs[mark];
}

/** A piece of a {@link Phrase}: plain text, text with emphasis, a mark such as › in "Settings › Models", or padding. */
export type Part =
  | string
  | { readonly text: string; readonly emphasis: "bold" | "dim" }
  | { readonly mark: Mark }
  | { readonly padding: Padding };

/**
 * Spaces that line up a column. A mark's stand-in can be wider than the mark
 * itself (`ok` for ✓), so the number of spaces depends on whether the stream
 * shows the Unicode marks. `columns` in the CLI's `columns.ts` works both out.
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

/** The phrase's words with no styling and the Unicode marks, as `--json`, a page and tests use them. */
export function plainText(value: Phrase): string {
  return value
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if ("mark" in part) {
        return markGlyph(part.mark);
      }
      return "padding" in part ? " ".repeat(part.padding.unicode) : part.text;
    })
    .join("");
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

/**
 * Adds text, joining it to plain text before it so a phrase has as few parts
 * as it needs.
 *
 * @example
 * const parts: Part[] = ["Wrote "];
 * pushText(parts, "12"); // parts is now ["Wrote 12"]
 */
export function pushText(parts: Part[], text: string): void {
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
