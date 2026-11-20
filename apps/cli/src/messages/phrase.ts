// The terminal's side of a phrase: drawing it with a stream's colours and
// marks, and cutting it to a width. The phrase itself, what JSON and Studio
// read too, is in `@halonicjs/words`.

import { type Padding, type Part, type Phrase, pushText } from "@halonicjs/words";
import { markText, type Paint } from "../output/paint.ts";

export {
  bold,
  dim,
  dimmed,
  joinedFacts,
  lineOfFacts,
  type Mark,
  markPart,
  type Padding,
  type Part,
  type Phrase,
  type PhraseValue,
  phrase,
  plainText,
} from "@halonicjs/words";

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
