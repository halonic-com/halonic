import { printable } from "../output/printable.ts";
import { counted, listInWords, timesInWords } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { money } from "./money.ts";
import { dim, markPart, type Phrase, phrase } from "./phrase.ts";
import { suggestedCommand } from "./suggested-command.ts";

/** Things a run sent, of one kind, such as 1 email: the count and the noun's two forms. */
export interface SentItems {
  readonly count: number;
  readonly one: string;
  readonly many: string;
}

/** What a finished run did, for its receipt line. Only the parts that apply are shown. */
export interface RunReceipt {
  readonly changedFiles: number;
  /**
   * What it sent, by kind. Empty only when the run made no tool call, which
   * reads "sent nothing". Left out when it made tool calls whose log doesn't
   * say what they sent: the receipt then has no sent part rather than a guess
   * (cli-output 3.4, revision 32).
   */
  readonly sent?: readonly SentItems[];
  readonly askedYou: number;
  /** The estimated cost in euros; left out for a run on the test model. */
  readonly estimatedCost?: number;
}

/**
 * The sentences of `halonic run <workflow>` (cli-output 1.9 and 3.4): the
 * heading, the waiting line and the receipt. A failed run's two lines are
 * in `run-failures.ts`. Wherever a line names a `halonic` command, `dir` is
 * the user's own `--dir`.
 */
export const runMessages = defineMessages("run", {
  summary: () => phrase`Run a workflow and follow it step by step`,
  /** What `run` was doing, for "✕ Couldn't run support-reply: …". */
  action: (workflow: string) => phrase`run ${workflow}`,
  /** The end of line 1 when `run` was refused before its first step. */
  nothingRan: () => phrase`Nothing ran.`,

  heading: (title: string, workspace: string, runId: string) =>
    phrase`Running ${title} in ${workspace} ${markPart("separator")} run ${runId}`,
  /** What a step's line says after its name: "Sorter · fast", "Gmail · fin@acme.example". */
  stepFacts: (facts: readonly string[]) => joinedFacts(facts),
  /** With a !: the wait step's description, its first line, as written. */
  waitingForYou: (description: string) => phrase`Waiting for you: ${description}`,
  /** With a !, for a wait step without a description. */
  waitingInStep: (step: string) => phrase`Waiting for you in the step ${step}.`,
  /**
   * Under the waiting line: the events in the step's order, the first one written out, each with
   * the author's label after it when it has one.
   */
  answerHere: (
    runId: string,
    events: readonly string[],
    dir?: string,
    labels: Readonly<Record<string, string>> = {},
  ) => answerLine(runId, events, dir, labels),
  /** With a !, before the run starts, for an agent set to "On this computer". Never a question. */
  onThisComputer: (agent: string, chosenOn: string) =>
    phrase`${agent} runs on this computer without the sandbox, as chosen on ${chosenOn}.`,

  /** "Support reply finished in 18 s.", with the duration as the output writes it. */
  finished: (title: string, duration: string) => phrase`${title} finished in ${duration}.`,
  /**
   * The receipt (glossary): changed, sent, asked and cost, in that order.
   * Empty when every part is left out; the run's output then has no middle line.
   */
  receipt: (receipt: RunReceipt) => receiptLine(receipt),
  runLog: (runId: string, dir?: string) =>
    phrase`Run log: ${suggestedCommand("runs show", dir, runId)}`,
  /** After "Stopped." when Ctrl C or SIGTERM stopped the run in this shell (cli-output 1.5). */
  cancelledAfter: (runId: string, step: string) =>
    phrase`The run ${runId} was cancelled after the step ${step}. Nothing after it ran.`,
});

function joinedFacts(facts: readonly string[]): Phrase {
  return facts.flatMap((fact, index) =>
    index === 0 ? [fact] : [" ", markPart("separator"), " ", fact],
  );
}

/**
 * "Answer in Studio's Inbox, or here: halonic runs send 01jd8q approve  (or reject)".
 * Three or more events read "(or reject, hold or skip)" (revision 37). The event stays, since it is
 * what the user types; a label follows it, as in "approve (Send reply)" (HAL-4072). A label is the
 * author's free text, so it is escaped (cli-output section 5).
 */
function answerLine(
  runId: string,
  events: readonly string[],
  dir: string | undefined,
  labels: Readonly<Record<string, string>>,
): Phrase {
  const labelOf = (event: string) => {
    const label = labels[event];
    return label === undefined ? undefined : printable(label);
  };
  const labelled = (event: string) => {
    const label = labelOf(event);
    return label === undefined ? event : `${event} (${label})`;
  };
  const [first = "", ...others] = events;
  const command = `${suggestedCommand("runs send", dir, runId)} ${first}`;
  const firstLabel = labelOf(first);
  const line =
    firstLabel === undefined
      ? phrase`Answer in Studio's Inbox, or here: ${command}`
      : phrase`Answer in Studio's Inbox, or here: ${command} ${dim(`(${firstLabel})`)}`;
  if (others.length === 0) {
    return line;
  }
  return phrase`${line}  ${dim(`(or ${listInWords(others.map(labelled), "or")})`)}`;
}

/** "Changed 1 file · sent 1 email · asked you once · estimated cost €0.004". */
function receiptLine(receipt: RunReceipt): Phrase {
  const parts: string[] = [];
  if (receipt.changedFiles > 0) {
    parts.push(`changed ${counted(receipt.changedFiles, "file", "files")}`);
  }
  // "Sent nothing" is what people check, so it's there whenever it's known.
  if (receipt.sent !== undefined) {
    parts.push(receipt.sent.length === 0 ? "sent nothing" : `sent ${sentInWords(receipt.sent)}`);
  }
  if (receipt.askedYou > 0) {
    parts.push(`asked you ${timesInWords(receipt.askedYou)}`);
  }
  if (receipt.estimatedCost !== undefined) {
    parts.push(`estimated cost ${money(receipt.estimatedCost)}`);
  }
  const [first, ...rest] = parts;
  if (first === undefined) {
    return [];
  }
  return joinedFacts([first.charAt(0).toUpperCase() + first.slice(1), ...rest]);
}

/** "1 email and 2 messages". */
function sentInWords(sent: readonly SentItems[]): string {
  return listInWords(sent.map((items) => counted(items.count, items.one, items.many)));
}
