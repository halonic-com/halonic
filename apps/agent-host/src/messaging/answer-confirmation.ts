import { createHash } from "node:crypto";
import type { InboxAnswer, InboxItem, InboxItemOption, InboxReach } from "@halonicjs/ports";

// A risky approve waits for the person's yes in Studio's shell (`agent-host.risky-answer-confirm`,
// HAL-17491 6.8 condition 2). The host decides which answers need it and gives the shell its own
// copy of the item to show; the page's word counts for nothing here.

/** The longest line the shell's confirmation shows, in characters. */
const lineMax = 200;

/**
 * What Studio's shell shows before a risky approve is sent, built only from the host's copy of the
 * item. `digest` binds the shell's yes to this item, as it is now, and this answer.
 */
export interface AnswerConfirmation {
  /** The item's first line, on one line, at most 200 characters. */
  title: string;
  /** Who asks: the agent's or the person's name, or "you". */
  from: string;
  /** The label of the option the person picked, which the item offers; absent for any other answer. */
  option?: string;
  /**
   * The note sent with the option, such as a budget override's new limit, under the option's own
   * `noteLabel`, each on one line. The source acts on it, so the person sees it before the yes.
   */
  note?: { label: string; text: string };
  /** What approving reaches, by name only, as the provider set it. */
  reach?: InboxReach;
  /** The SHA-256 of the item and the answer, which the confirmed send checks. */
  digest: string;
}

/** The option `item` offers under `id`, if any. */
export function offeredOption(item: InboxItem, id: string): InboxItemOption | undefined {
  return item.options.find((option) => option.id === id);
}

/**
 * Whether `answer` to `item` needs the person's yes in the shell: the item is anything but
 * `normal`, and the answer isn't an option the provider marked as declining. An option's ID
 * counts for nothing, since an agent can name a destructive option `reject`. A risk the host
 * doesn't know, or an answer it can't tell, needs it too.
 */
export function needsConfirmation(item: InboxItem, answer: InboxAnswer): boolean {
  if (item.risk === undefined || item.risk === "normal") return false;
  return !(answer.kind === "option" && offeredOption(item, answer.option)?.declines === true);
}

/** The shell's confirmation of `answer` to `item`; the caller checked the item offers its option. */
export function confirmationOf(item: InboxItem, answer: InboxAnswer): AnswerConfirmation {
  const option = answer.kind === "option" ? offeredOption(item, answer.option) : undefined;
  const note = answer.kind === "option" && answer.note !== undefined ? oneLine(answer.note) : "";
  return {
    title: oneLine(item.question.split("\n").find((line) => line.trim() !== "") ?? ""),
    from: authorName(item),
    ...(option === undefined ? {} : { option: oneLine(option.label) }),
    ...(note === "" ? {} : { note: { label: oneLine(option?.noteLabel ?? "Note"), text: note } }),
    ...(item.reach === undefined ? {} : { reach: item.reach }),
    digest: answerDigest(item, answer),
  };
}

/**
 * The SHA-256, as hex, of the whole item and the answer, in a fixed key order. Any change to the
 * item, its state, question, options, risk or reach included, gives another digest.
 *
 * It is no secret: a plain hash of data the page can see, which the page could compute itself.
 * Only the fact that no page can reach `answer-confirmed` stops a page from approving, so that
 * route must never be mounted where a page can call it (host-server, the paired server).
 */
export function answerDigest(item: InboxItem, answer: InboxAnswer): string {
  return createHash("sha256").update(canonicalJson({ item, answer })).digest("hex");
}

/** `value` as JSON with every object's keys sorted, so the same data always gives the same text. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const fields = Object.entries(value)
      .filter(([, field]) => field !== undefined)
      // An object's keys are unique, so no two compare equal.
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([name, field]) => `${JSON.stringify(name)}:${canonicalJson(field)}`);
    return `{${fields.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function authorName(item: InboxItem): string {
  return item.from.kind === "me" ? "you" : oneLine(item.from.name);
}

/**
 * `text` on one line: format characters (bidi controls, zero-width ones) and lone surrogates
 * dropped, control characters and runs of white space made one space, and cut between code
 * points to {@link lineMax} with "…", so the shell's JSON reader never meets half a pair.
 */
function oneLine(text: string): string {
  const line = text
    .replace(/[\p{Cf}\p{Cs}]/gu, "")
    .replace(/[\s\p{Cc}]+/gu, " ")
    .trim();
  if (line.length <= lineMax) return line;
  let cut = "";
  for (const codePoint of line) {
    if (cut.length + codePoint.length > lineMax - 1) break;
    cut += codePoint;
  }
  return `${cut}…`;
}
