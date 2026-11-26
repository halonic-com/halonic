// What a wait card shows apart from its draft (`inbox.wait-context`, HAL-19395): the step's own
// closing words, which become a caption by the answers, and the input the run started with, which
// is quoted above the draft. Core gives the card only the filled-in body, so the closing words are
// found by comparing it with the step's description as written.

import type { RunEvent } from "@halonicjs/events";

/** A wait step's body, split into the draft and the step's closing words. */
export interface WaitParts {
  /** The body without the closing words; the whole body when it has none. */
  readonly draft: string;
  /** The step's closing words, such as "Approving finishes the run. Nothing is sent."; `null` when it has none. */
  readonly note: string | null;
}

/** A paragraph break: an empty line, or one holding only spaces. */
const paragraphBreak = /\n[ \t]*\n/;

/**
 * Splits off the step's closing words: the paragraphs at the end of its description that hold no
 * `{{…}}`, after at least one that does. Only words the workflow's author wrote count, never model
 * output, so a draft that happens to end like them keeps them when the description has none. A body
 * that doesn't end with those words, or a description that fills nothing in, stays whole.
 *
 * @param description - the step's description as written, its first line the title
 *
 * @example
 * waitParts("Sorry, Sam.\n\nApproving finishes the run.", "Approve?\n{{context.reply}}\n\nApproving finishes the run.");
 * // { draft: "Sorry, Sam.", note: "Approving finishes the run." }
 */
export function waitParts(body: string, description: string | undefined): WaitParts {
  const whole = { draft: body, note: null };
  if (description === undefined) return whole;
  const paragraphs = description.split("\n").slice(1).join("\n").trim().split(paragraphBreak);
  const lastFilled = paragraphs.findLastIndex((paragraph) => paragraph.includes("{{"));
  if (lastFilled === -1 || lastFilled === paragraphs.length - 1) return whole;
  const note = paragraphs
    .slice(lastFilled + 1)
    .join("\n\n")
    .trim();
  if (!body.endsWith(note)) return whole;
  const draft = body.slice(0, body.length - note.length).trimEnd();
  return draft === "" ? whole : { draft, note };
}

/**
 * The text the run started with in its start field, such as the customer's email; `undefined` when
 * the log has no start, or the field is missing, empty or not text.
 *
 * @example
 * startInput(events, "mail"); // "Hi, my order #1042 arrived damaged. Can I get a refund?"
 */
export function startInput(events: readonly RunEvent[], field: string): string | undefined {
  for (const event of events) {
    if (event.type !== "run.started") continue;
    const value = event.input[field];
    return typeof value === "string" && value.trim() !== "" ? value : undefined;
  }
  return undefined;
}
