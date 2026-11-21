import { moneyAmount } from "@halonicjs/app";
import type { RunSends } from "@halonicjs/events";
import { printable } from "../output/printable.ts";
import { counted, listInWords, timesInWords } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { oldestSupported } from "./doctor.ts";
import { harnessNames } from "./harness-names.ts";
import { dim, joinedFacts, lineOfFacts, markPart, type Phrase, phrase } from "./phrase.ts";
import { sendsInWords } from "./sends.ts";
import { suggestedCommand } from "./suggested-command.ts";
import { trustMessages } from "./trust.ts";
import { countInWords } from "./words.ts";

/** "Nothing ran.": the fail-closed promise when `run` was refused before its first step (cli-output 1.3). */
const nothingRan = phrase`Nothing ran.`;

/** What `--input` takes, in the usage line and the help (cli-output 3.4). */
export const inputValueName = "file or JSON";

/** What a finished run did, for its receipt line. Only the parts that apply are shown. */
export interface RunReceipt {
  readonly changedFiles: number;
  /**
   * What it sent and may have sent, read from its log by `sendsOf`. Its parts
   * are worded by `sendsInWords` (cli-output 3.4, "What it sent").
   */
  readonly sends: RunSends;
  readonly askedYou: number;
  /** The estimated cost in euros; left out for a run on the test model. */
  readonly estimatedCost?: number;
}

/** A part of a plugin as a run's warning names it: the backend, or a program by its escaped name. */
export type PluginPartShown =
  | { readonly kind: "backend" }
  | { readonly kind: "program"; readonly name: string };

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
  /**
   * Its fix. In 0.1.0 a first commit is how a workspace goes live (Sofia,
   * HAL-6041). Once the Studio or a CLI make-live command exists, this names it.
   */
  nothingLiveFix: () => phrase`Make a first commit in git, then run again.`,
  /**
   * A dimmed line before the run's heading when a definition file has
   * uncommitted changes: the run starts the live version, the latest commit,
   * without them (HAL-6007).
   */
  changesNotLive: () => [dim("Your uncommitted changes aren't used. Commit them to run them.")],
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
   * The reason after "Couldn't run support-reply:" when the git found is a
   * wrapper script, a version manager's shim or a git older than 2.31, which
   * drops Halonic's git settings, so it can't run safely (HAL-12342). Exit 9,
   * as {@link gitWontStart}, and the same meaning as the Studio's refusal.
   */
  gitNotItself: (git: string, nothingDone: Phrase = nothingRan) =>
    phrase`the git at ${git} doesn't pass Halonic's git settings on to git, so the live version can't be read safely. ${nothingDone}`,
  /** Its fix: Halonic takes git from the PATH, so git itself goes first on it. */
  gitNotItselfFix: () =>
    phrase`It may be a wrapper script, a version manager's shim or git older than 2.31. Put git 2.31 or later itself first on your PATH, then try again.`,
  /**
   * After the sandbox's fix when it can't start for an agent in a harness:
   * Halonic's own loop starts no program, so it needs no sandbox. Only `run`
   * has the option, and "On this computer" is never the way out (HAL-12597).
   */
  sandboxRefusedHarnessHint: () =>
    phrase`Or run it with --harness halonic, which runs every agent in Halonic's own loop and needs no sandbox.`,
  /** `--input`'s line in the help. */
  inputOption: () => phrase`The run's input: a JSON file, or the JSON itself.`,
  /** `--event`'s line in the help. */
  eventOption: () =>
    phrase`What to answer when the run waits for you, such as approve. One per wait, in order.`,
  /** `--follow`'s line in the help. */
  followOption: () =>
    phrase`With --json, print one line for each event as it happens, then the result.`,
  /** `--harness`'s line in the help. */
  harnessOption: () =>
    phrase`The harness every agent of the run runs in, in place of its own: halonic, claude-code or codex.`,
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
  /**
   * `--harness` would start an agent whose file names `asks` in a program
   * other than Claude Code, which doesn't follow it (exit 2, HAL-14992).
   */
  asksOnlyInClaudeCode: (agent: string, harness: string, ending: Phrase) =>
    phrase`${printable(agent)}'s file uses asks, which only Claude Code follows, but this run starts ${printable(agent)} in ${harnessNames.get(harness) ?? printable(harness)}. ${ending}`,
  /**
   * Its fix. Leaving out `--harness` starts the agent in its own program,
   * Claude Code. `runs send` has no `--harness` (HAL-12597), so it says to
   * start the run again without it, which fits both commands (HAL-15117).
   */
  asksOnlyInClaudeCodeFix: (agent: string, harness: string) =>
    phrase`Start the run again without --harness ${printable(harness)}, so ${printable(agent)} runs in Claude Code, or remove asks from ${printable(agent)}'s file.`,
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
  /**
   * The same, when the input lacks a field the first step reads (C337 C9):
   * "the input has no field mail, which the step Read the email reads. Your
   * input has: email." `given` is the input's fields, or `undefined` without
   * `--input`.
   */
  inputLacksFields: (missing: readonly string[], step: string, given?: readonly string[]) => {
    const fields = `${missing.length === 1 ? "field" : "fields"} ${listInWords(missing.map(printable), "or")}`;
    return phrase`the input has no ${fields}, which the step ${printable(step)} reads. ${inputHas(given)}`;
  },
  /** Its fix. */
  inputLacksFieldsFix: (missing: readonly string[]) =>
    phrase`Pass a JSON object with ${listInWords(missing.map(printable))}, in a file or as text, such as --input input.json.`,
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
  /**
   * A provider's note on how it changed the run's model calls, in its own
   * words, such as "Left out temperature: claude-sonnet-5-5 doesn't take it."
   * (requirement `cli.run-provider-notes`).
   */
  providerNote: (note: string) => phrase`${printable(note)}`,
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
  /**
   * With a !, for a tool call that waits for the user's OK: who asked and which tool. Both come
   * from workspace files and a connector, so they are made printable (cli-output section 5).
   */
  waitingForApproval: (agent: string, tool: string) =>
    phrase`Waiting for your approval: ${printable(agent)} wants to use ${printable(tool)}`,
  /** Under the answer line, when several tool calls wait: one answer settles only the first listed. */
  oneAnswerTakesTheFirst: () => phrase`Each answer settles the first one listed.`,
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
  /**
   * A `--debug` line when a run's connectors failed to close after it ended,
   * a leftover program copy couldn't be swept, a harness run left something that couldn't be cleaned up,
   * or a plugin program's session folders couldn't be removed. Nothing tries it again.
   */
  cleanUpFailed: (
    what: "run-connectors" | "program-copies" | "harness-host" | "program-folders",
    reason: string,
  ) => {
    if (what === "program-folders") {
      return phrase`the engine couldn't remove the folders of a plugin program's session: ${reason}`;
    }
    if (what === "run-connectors") {
      return phrase`the engine couldn't close a run's connectors: ${reason}`;
    }
    if (what === "harness-host") {
      return phrase`the engine couldn't clean up after a harness run: ${reason}`;
    }
    return phrase`the engine couldn't sweep a leftover program copy: ${reason}`;
  },
  /**
   * A `--debug` line when the run log couldn't record a failure of a harness
   * run's bridge (requirement `harness-host.bridge-failures`): the failure,
   * then the run log's own error when it named one.
   */
  bridgeFailureUnrecorded: (failure: string, cause: string | undefined) =>
    cause === undefined
      ? phrase`the engine couldn't write a harness bridge failure to the run log: ${failure}`
      : phrase`the engine couldn't write a harness bridge failure to the run log: ${failure} (caused by: ${cause})`,
  /**
   * Listed tools a turn left out because nobody approved them, with the
   * command that approves them. Nobody can answer in a run, so this is the
   * only place the command is named. The names arrive escaped.
   */
  toolsWaiting: (source: string, names: string, command: string) =>
    phrase`The tools ${names} of ${source} wait for your approval and stay off. To approve them, run ${command}`,
  /**
   * A `--debug` line naming the key a sandboxed harness agent spends, by its
   * provider and its secret's name, never its value (HAL-12784).
   */
  harnessKey: (agent: string, providerId: string, secret: string) =>
    phrase`${agent} calls its model with the key in secret ${secret}, from provider ${providerId}.`,
  /**
   * The warning for a sandboxed harness agent with no provider key: the
   * program's own sign-in doesn't reach the sandbox, so it may run signed out.
   */
  harnessSignedOut: (agent: string, type: string) =>
    phrase`${agent} runs in the sandbox, where its program can't use your own sign-in. If it fails as signed out, add a provider of type ${type} with a secret, and save the key with halonic secret set.`,
  /**
   * Line 1 of the warning for one part of a plugin, its backend or one of
   * its programs, that can't start (HAL-12343), in the shape of
   * `connectorStart.notStarted`. The plugin's other parts keep working. The
   * reason follows on line 2 (C484-1, HAL-12343). The names arrive escaped.
   */
  pluginPartOff: (plugin: string, part: PluginPartShown) =>
    part.kind === "backend"
      ? phrase`The backend of the plugin ${plugin} didn't start, so its tools are off in this run.`
      : phrase`The program ${part.name} of the plugin ${plugin} didn't start, so its tools are off in this run.`,
  /** Line 2 for `sandbox-not-fenced`: the session opened, but not in a sandbox Halonic could confirm. */
  pluginPartNotConfirmed: () =>
    phrase`Halonic couldn't confirm that the sandbox limits this program on this computer.`,
  /** The `--debug` line under it: the fence state the session reported, for an engineer. */
  pluginPartFence: (fence: string) =>
    phrase`the program's sandbox session opened with its fence ${fence}, so the program didn't start`,
  /** Line 2 for `network-needs-srt`. */
  pluginPartNetwork: () =>
    phrase`It reaches the network, and the Windows 11 sandbox can't limit a program to single sites yet.`,
  /** Line 2 for `settings-not-set`, with the settings' names escaped. No command sets them yet, so no fix line. */
  pluginPartSettings: (settings: readonly string[]) =>
    phrase`These settings of the plugin have no value: ${settings.join(", ")}.`,
  /** Line 2 for `not-trusted` and `failed`: the error's own text, escaped, which says what to do. */
  pluginPartError: (error: string) => phrase`${error}`,
  /** The same when a stopped command gave up waiting for the engine to close (HAL-6677). */
  closeAbandoned: (seconds: number) =>
    phrase`the engine didn't close within ${seconds} s of the stop; released its lock and ending without it`,

  /** "Support reply finished in 18 s.", with the duration as the output writes it. */
  finished: (title: string, duration: string) => phrase`${title} finished in ${duration}.`,
  /**
   * The receipt (glossary): changed, sent, asked and cost, in that order.
   * Empty when every part is left out; the run's output then has no middle line.
   */
  receipt: (receipt: RunReceipt) => receiptLine(receipt),
  runLog: (runId: string, dir?: string) =>
    phrase`Run log: ${suggestedCommand("runs show", dir, runId)}`,
  /** Under the run log line when a step wrote something: the way to read it (HAL-12073). */
  outputHint: (runId: string, dir?: string) =>
    phrase`Output: ${suggestedCommand("runs show", dir, `${runId} --output`)}`,
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

/**
 * "Answer with: halonic runs send 01jd8q approve (or reject)". No Inbox until the Studio shows one
 * (HAL-5915).
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
      ? phrase`Answer with: ${command}`
      : phrase`Answer with: ${command} ${dim(`(${firstLabel})`)}`;
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

/** "Changed 1 file · sent 1 email · saved 1 Drive file · asked you once · estimated cost €0.004". */
function receiptLine(receipt: RunReceipt): Phrase {
  const parts: string[] = [];
  if (receipt.changedFiles > 0) {
    parts.push(`changed ${counted(receipt.changedFiles, "file", "files")}`);
  }
  // "Sent nothing" is what people check, so it's there whenever it's known.
  parts.push(...sendsInWords(receipt.sends));
  if (receipt.askedYou > 0) {
    parts.push(`asked you ${timesInWords(receipt.askedYou)}`);
  }
  if (receipt.estimatedCost !== undefined) {
    parts.push(`estimated cost ${moneyAmount(receipt.estimatedCost)}`);
  }
  return lineOfFacts(parts);
}

/** What the input has, after "the input has no field mail, …": its fields, none, or no `--input`. */
function inputHas(given: readonly string[] | undefined): string {
  if (given === undefined) {
    return "You gave no --input.";
  }
  if (given.length === 0) {
    return "Your input has no fields.";
  }
  return `Your input has: ${given.map(printable).join(", ")}.`;
}
