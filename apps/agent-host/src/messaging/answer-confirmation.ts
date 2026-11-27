import { createHash } from "node:crypto";
import type { InboxAnswer, InboxItem, InboxReach } from "@halonicjs/ports";

// A risky approve waits for the person's yes in Studio's shell (`agent-host.risky-answer-confirm`,
// HAL-17491 6.8 condition 2). The host decides which answers need it and gives the shell its own
// copy of the item to show; the page's word counts for nothing here.

/** The options that turn a risky item down; any other answer to one approves or accepts it. */
const turningDown: ReadonlySet<string> = new Set(["reject", "request-changes"]);

/** The longest title the shell's confirmation shows, in characters. */
const titleMax = 200;

/**
 * What Studio's shell shows before a risky approve is sent, built only from the host's copy of the
 * item. `digest` binds the shell's yes to this item, as it is now, and this answer.
 */
export interface AnswerConfirmation {
  /** The item's first line, on one line, at most 200 characters. */
  title: string;
  /** Who asks: the agent's or the person's name, or "you". */
  from: string;
  /** The label of the option the person picked; absent for any other answer. */
  option?: string;
  /** What approving reaches, by name only, as the provider set it. */
  reach?: InboxReach;
  /** The SHA-256 of the item and the answer, which the confirmed send checks. */
  digest: string;
}

/**
 * Whether `answer` to `item` needs the person's yes in the shell: the item is anything but
 * `normal`, and the answer isn't an option that turns it down. A risk the host doesn't know, or
 * an answer it can't tell, needs it too.
 */
export function needsConfirmation(item: InboxItem, answer: InboxAnswer): boolean {
  if (item.risk === undefined || item.risk === "normal") return false;
  return !(answer.kind === "option" && turningDown.has(answer.option));
}

/** The shell's confirmation of `answer` to `item`. */
export function confirmationOf(item: InboxItem, answer: InboxAnswer): AnswerConfirmation {
  const option =
    answer.kind === "option"
      ? (item.options.find((each) => each.id === answer.option)?.label ?? answer.option)
      : undefined;
  return {
    title: oneLine(item.question.split("\n").find((line) => line.trim() !== "") ?? ""),
    from: authorName(item),
    ...(option === undefined ? {} : { option: oneLine(option) }),
    ...(item.reach === undefined ? {} : { reach: item.reach }),
    digest: answerDigest(item, answer),
  };
}

/**
 * The SHA-256, as hex, of the whole item and the answer, in a fixed key order. Any change to the
 * item, its state, question, options, risk or reach included, gives another digest.
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

/** `text` on one line, without control characters, cut to {@link titleMax} with "…". */
function oneLine(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it removes.
  const line = text.replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim();
  return line.length <= titleMax ? line : `${line.slice(0, titleMax - 1)}…`;
}
