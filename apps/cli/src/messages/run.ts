import { printable } from "../output/printable.ts";
import { counted, listInWords, timesInWords } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { oldestSupported } from "./doctor.ts";
import { money } from "./money.ts";
import { dim, markPart, type Phrase, phrase } from "./phrase.ts";
import { suggestedCommand } from "./suggested-command.ts";
import { trustMessages } from "./trust.ts";
import { countInWords } from "./words.ts";

/** "Nothing ran.": the fail-closed promise when `run` was refused before its first step (cli-output 1.3). */
const nothingRan = phrase`Nothing ran.`;

/** What `--input` takes, in the usage line and the help (cli-output 3.4). */
export const inputValueName = "file or JSON";

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
  nothingRan: () => nothingRan,
  /**
   * Line 1 when the workspace has history but no version yet, so no
   * workflow is live (Sofia, HAL-4850): `conflict`, exit 5.
   */
  nothingLive: () => phrase`Nothing is live yet, so there is nothing to run. ${nothingRan}`,
  /** Its fix. The CLI has no make-live command yet; once it has, this names it. */
  nothingLiveFix: () => phrase`Make the workspace live in the Studio, then run again.`,
  /**
   * The reason after "Couldn't run support-reply:" when the workspace is a
   * git folder but git can't start, so the live version can't be read:
   * `unavailable`, exit 9. As the sandbox's refusal, it ends with "Nothing
   * ran.", or `runs send`'s "Nothing was sent.". Git's own reason shows with
   * `--debug`.
   */
  gitWontStart: (nothingDone: Phrase = nothingRan) =>
    phrase`git can't start on this computer, so the live version can't be read. ${nothingDone}`,
  /** Its fix. */
  gitWontStartFix: () => phrase`Install git and make sure it's on your PATH, then try again.`,
  /**
   * The reason after "Couldn't run support-reply:" when an agent of the
   * workflow is in a harness (Claude Code or Codex), which this computer's
   * engine has no adapter for yet: `unavailable`, exit 9. `harness` is the
   * id an agent file writes; the line shows its name, as doctor does.
   */
  harnessNotAvailable: (agent: string, harness: string) => {
    const name = trustMessages.harnessName(harness).phrase;
    return phrase`Halonic can't run agents in ${name} yet, and ${agent} is in ${name}. ${nothingRan}`;
  },
  /** Its fix: `--harness halonic` runs every agent in Halonic's own loop (Liam, HAL-5367). */
  harnessNotAvailableFix: () => phrase`Run it with --harness halonic.`,
  /** `--input`'s line in the help. */
  inputOption: () => phrase`The run's input: a JSON file, or the JSON itself.`,
  /** `--event`'s line in the help. */
  eventOption: () =>
    phrase`What to answer when the run waits for you, such as approve. One per wait, in order.`,
  /** `--harness`'s line in the help. */
  harnessOption: (harnesses: readonly string[]) =>
    phrase`The harness every agent of the run runs in, in place of its own: ${listInWords(harnesses, "or")}.`,
  /**
   * The reason after "Couldn't run support-reply:" when `--harness` names
   * no harness (exit 2). Words for HAL-189 6b, placeholders like doctor's
   * Harnesses line until Sofia's check.
   */
  noHarness: (typed: string) =>
    phrase`there's no harness called ${printable(typed)}. ${nothingRan}`,
  /** Its fix: the harnesses there are. */
  noHarnessFix: (harnesses: readonly string[]) =>
    phrase`Use ${listInWords(harnesses, "or")}, or leave --harness out to run each agent in its own.`,
  /** The reason when the `--harness` program isn't installed here (exit 9). */
  harnessMissing: (harness: string) =>
    phrase`${harness} isn't installed on this computer. ${nothingRan}`,
  /** Its fix. */
  installHarness: (harness: string) => phrase`Install ${harness}, then run again.`,
  /** The reason when the `--harness` program is too old; `supported` as `detect()` writes it, ">=1.0.0". */
  harnessUnsupported: (harness: string, version: string, supported: string) =>
    phrase`${harness} ${version} isn't supported. Halonic needs ${oldestSupported(supported)} or newer. ${nothingRan}`,
  /** Its fix. */
  updateHarness: (harness: string) => phrase`Update ${harness}, then run again.`,
  /**
   * The reason when asking the `--harness` program for its version failed;
   * `reason` is the harness's own sentence and ends with its full stop.
   */
  harnessVersionFailed: (harness: string, reason: string) =>
    phrase`Halonic found ${harness} but couldn't ask its version: ${reason} ${nothingRan}`,
  /** Its fix. */
  checkHarness: (harness: string) =>
    phrase`Check that ${harness} starts in a terminal, then run again.`,
  /**
   * The reason when the run's harness would move an agent from Halonic's
   * own loop into a program while its file names allowed sites or a
   * working folder, which no check read (exit 2). `ending` is "Nothing
   * ran." or `runs send`'s "Nothing was sent.".
   */
  uncheckedHarnessFields: (agent: string, ending: Phrase) =>
    phrase`${printable(agent)} names allowed sites or a working folder, but its file runs it in Halonic's own loop, so they were never checked. ${ending}`,
  /** Its fix. */
  uncheckedHarnessFieldsFix: (agent: string) =>
    phrase`Name a harness in ${printable(agent)}'s file and trust the workspace again, or remove allowed sites and the working folder from it.`,
  /** No workflow, or more than one, on the command line (exit 2). */
  takesOneWorkflow: (given: readonly string[]) =>
    given.length === 0
      ? phrase`halonic run needs a workflow.`
      : phrase`halonic run takes one workflow, and you gave ${countInWords(given.length)}: ${given.join(", ")}.`,
  /** The reason after "Couldn't run support-reply:" when `--input` names no file and isn't JSON. */
  noInputFile: (path: string) => phrase`there's no file ${path}.`,
  /** The same, when the file or the text isn't JSON; `source` is the file, or left out for the text. */
  inputNotJson: (source?: string) =>
    source === undefined
      ? phrase`the input isn't valid JSON.`
      : phrase`${source} isn't valid JSON.`,
  /** The same, when the JSON is a list, a string or a number. */
  inputNotAnObject: () => phrase`the input must be a JSON object.`,
  /** The same, when `--input` names a folder. Its fix is {@link inputFix}. */
  inputIsFolder: (path: string) => phrase`${path} is a folder, not a file.`,
  /** The same, when the file is there but can't be read, such as for its permissions. */
  inputUnreadable: (path: string) => phrase`${path} can't be read.`,
  /** The fix under an `--input` file that can't be read. */
  inputUnreadableFix: () => phrase`Check the file's permissions, or pass the JSON as text.`,
  /**
   * Dim, with a !, after the result when the run ended before it took the
   * last `--event`s: "Didn't use --event reject: the run ended first."
   */
  unusedEvents: (events: readonly string[]) =>
    phrase`Didn't use ${listInWords(
      events.map((event) => `--event ${event}`),
      "and",
    )}: the run ended first.`,
  /** The fix under a missing `--input` file: most often a typo in the path. */
  noInputFileFix: () =>
    phrase`Check the file name. It's looked for from the folder you ran the command in.`,
  /**
   * The fix under an input that isn't a JSON object. It names a file, not inline
   * JSON, because single-quoted JSON doesn't survive cmd or Windows PowerShell 5.1.
   */
  inputFix: () => phrase`Pass a JSON object, in a file or as text, such as --input input.json.`,
  /**
   * Line 1's reason when the workspace was never trusted here: F16, then
   * "Nothing ran." (exit 3), or `runs send`'s "Nothing was sent.".
   */
  notTrusted: (workspace: string, nothingDone: Phrase = nothingRan) =>
    phrase`${trustMessages.notTrustedYet(workspace).phrase} ${nothingDone}`,
  /** The same, when it changed since it was trusted. */
  changedSinceTrusted: (workspace: string, nothingDone: Phrase = nothingRan) =>
    phrase`${workspace} changed since you trusted it. ${nothingDone}`,

  heading: (title: string, workspace: string, runId: string) =>
    phrase`Running ${title} in ${workspace} ${markPart("separator")} run ${runId}`,
  /** What a step's line says after its name: "Sorter · fast", "Gmail · fin@acme.example". */
  stepFacts: (facts: readonly string[]) => joinedFacts(facts),
  /** The same, for a tool call a subagent asked for: "Checker, for Sorter · fast". */
  subagentStepFacts: (subagent: string, facts: readonly string[]) =>
    phrase`${subagent}, for ${joinedFacts(facts)}`,
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

  /**
   * A `--debug` line for an engineer (requirement `cli.debug-lines`): the
   * engine's timer failed and the scheduler tries it again. The timer and
   * the run are named as the engine names them.
   */
  timerRetried: (timer: string, runKey: string, failures: number, most: number, reason: string) =>
    phrase`the engine's timer ${timer} of ${runKey} failed, try ${failures} of ${most}, retrying: ${reason}`,
  /** The same for the scheduler's own wake-up or tick, which belongs to no run. */
  schedulerRetried: (what: "wake-up" | "tick", failures: number, most: number, reason: string) =>
    phrase`the scheduler's ${what} failed, try ${failures} of ${most}, retrying: ${reason}`,

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
  /**
   * After "Stopped." when Ctrl C or SIGTERM stopped following the run but
   * couldn't cancel it, so it may go on (HAL-4356).
   */
  notCancelled: (runId: string, dir?: string) =>
    phrase`The run ${runId} wasn't cancelled, only no longer followed, so it may go on. See where it is: ${suggestedCommand("runs show", dir, runId)}`,
});

function joinedFacts(facts: readonly string[]): Phrase {
  return facts.flatMap((fact, index) =>
    index === 0 ? [fact] : [" ", markPart("separator"), " ", fact],
  );
}

/**
 * "Answer in Studio's Inbox, or here: halonic runs send 01jd8q approve (or reject)".
 * Three or more events read "(or reject, hold or skip)" (revision 37). The event stays, since it is
 * what the user types; a label follows it, as in "approve (Send reply)" (HAL-4072). A label that
 * only repeats its event, as "Approve" for approve, is left out (HAL-4190). A label is the author's
 * free text, so it is escaped (cli-output section 5).
 */
function answerLine(
  runId: string,
  events: readonly string[],
  dir: string | undefined,
  labels: Readonly<Record<string, string>>,
): Phrase {
  const labelOf = (event: string) => {
    // Own keys only: an event may be named `toString` or `constructor`.
    const label = Object.hasOwn(labels, event) ? labels[event] : undefined;
    return label === undefined || repeatsEvent(label, event) ? undefined : printable(label);
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
  return phrase`${line} ${dim(`(or ${listInWords(others.map(labelled), "or")})`)}`;
}

/**
 * Whether a label says nothing its event doesn't: the two match apart from case, spaces, dashes and
 * underscores, as "Needs changes" and needs_changes do. Nothing looser, so "Send it" for approve
 * still shows (HAL-4190).
 */
function repeatsEvent(label: string, event: string): boolean {
  const bare = (text: string) => text.toLowerCase().replace(/[\s_-]/g, "");
  return bare(label) === bare(event);
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
