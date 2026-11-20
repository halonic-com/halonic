import { type Mark, markGlyph } from "@halonicjs/words";
import type { OutputStyle } from "./style.ts";

export type { Mark } from "@halonicjs/words";

/** How a mark looks in a terminal; its Unicode text is the phrase's own (`markGlyph`). */
interface MarkLook {
  /** The stand-in when the stream isn't UTF-8: `ok`, `x` and `!` from the design, plain ASCII for the rest. */
  readonly ascii: string;
  /** The colour the mark gets when colour is on. */
  readonly colour: Colour | "default" | "dim";
}

type Colour = "green" | "red" | "yellow";

const marks: Readonly<Record<Mark, MarkLook>> = {
  done: { ascii: "ok", colour: "green" },
  failed: { ascii: "x", colour: "red" },
  needsYou: { ascii: "!", colour: "yellow" },
  working: { ascii: "..", colour: "default" },
  separator: { ascii: "-", colour: "dim" },
  studioPath: { ascii: ">", colour: "default" },
};

// SGR codes, each with the code that ends it. A colour's 39 leaves bold and dim alone, but bold
// and dim share 22, which ends both: a dim word inside a bold text ends the bold too, so the
// two are never nested.
const sgr = {
  green: ["32", "39"],
  red: ["31", "39"],
  yellow: ["33", "39"],
  bold: ["1", "22"],
  dim: ["2", "22"],
} as const;

/**
 * Writes marks, colour, bold and dim for one stream. With colour off every
 * method returns its text unchanged, so a pipe never gets an escape code.
 * Colour only adds: the text reads the same without it.
 */
export interface Paint {
  /** Whether the stream shows the Unicode marks, or their ASCII stand-ins. */
  readonly unicode: boolean;
  /** The mark, coloured when colour is on, or its stand-in when the stream isn't UTF-8. */
  mark(mark: Mark): string;
  /** The one name or number that matters on a line. */
  bold(text: string): string;
  /** Secondary text: paths, durations, codes and hints. */
  dim(text: string): string;
}

/** The mark's own text, without colour: the Unicode mark, or its stand-in for a stream that isn't UTF-8. */
export function markText(mark: Mark, unicode: boolean): string {
  return unicode ? markGlyph(mark) : marks[mark].ascii;
}

/** The {@link Paint} for a stream with `style`. */
export function paintFor(style: OutputStyle): Paint {
  const wrap = (codes: readonly [string, string], text: string): string =>
    style.colour && text !== "" ? `\u001b[${codes[0]}m${text}\u001b[${codes[1]}m` : text;
  return {
    unicode: style.unicode,
    mark(mark) {
      const text = markText(mark, style.unicode);
      const colour = marks[mark].colour;
      return colour === "default" ? text : wrap(sgr[colour], text);
    },
    bold: (text) => wrap(sgr.bold, text),
    dim: (text) => wrap(sgr.dim, text),
  };
}
