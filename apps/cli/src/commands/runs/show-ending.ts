// How `halonic runs show` ends, after the step lines (cli-output 3.4): a
// finished run as a finished `halonic run` ends, a failed or stopped run
// with `run`'s failure lines, a waiting run with `run`'s waiting lines.
// Every sentence is the catalogue's.

import { type RunDetail, runWait, shortRunId } from "@halonicjs/app";
import {
  type FailedStart,
  failedModelOf,
  failedStartOf,
  type RunFailedEvent,
  type RunFailure,
  runFailureOf,
  type WorkspaceModels,
} from "@halonicjs/app/run-failure";
import {
  answerChoicesOf,
  endedWithParent,
  type RunEvent,
  type RunSummary,
} from "@halonicjs/events";
import { duration } from "../../messages/duration.ts";
import { markPart, type Phrase, phrase } from "../../messages/phrase.ts";
import { runMessages } from "../../messages/run.ts";
import { offOptionsStart } from "../../messages/run-failure-words.ts";
import { type FailedRun, runFailedLines } from "../../messages/run-failures.ts";
import { type CancelledAt, runsMessages } from "../../messages/runs.ts";
import { stepName } from "../../messages/step-name.ts";
import { runFailureDetails } from "../../run-failure-details.ts";
import { agentName, hasAgentOutput, type RunDefinitions, receiptOf } from "../../run-view.ts";
import { runEnding, waitDescription } from "./listed-run.ts";
import { waitBodyLines } from "./wait-body.ts";

/**
 * What follows the step lines: a finished run's "✓ Support reply finished
 * in 18 s." and the receipt under it, as a finished `halonic run` ends; a
 * failed or stopped run's ✕ line, its fix and the receipt; or a waiting
 * run's two waiting lines. A running run ends with its step lines.
 *
 * @param models - the workspace's models, read only for a failed run
 * @param debugging - `--debug` was given, so a failed run's general lines don't ask for it
 * @param children - the child runs the run failed with or waits on, whose lines it says
 * @param localOnlySaved - Local only is on only because the saved workspace.yaml says on, so a
 *   local-only refusal says it isn't live yet; only `halonic run` knows, as it read the version
 */
export function showEnding(
  run: RunDetail,
  title: string,
  definitions: RunDefinitions,
  models: () => WorkspaceModels,
  dir: string | undefined,
  debugging = false,
  children: ChildEndings = {},
  localOnlySaved = false,
): Phrase[] {
  switch (run.summary.status) {
    case "completed":
      return finishedEnding(run, title, definitions);
    case "failed":
      return failedEnding(
        { run, title, definitions, models },
        { dir, debugging, localOnlySaved, child: children.failed },
      );
    case "cant-try":
      return cantTryEnding(run, title, definitions);
    case "waiting":
      return runWait(run.summary).kind === "child-run" && children.waiting !== undefined
        ? waitingEnding(children.waiting.summary, children.waiting.definitions, dir)
        : waitingEnding(run.summary, definitions, dir);
    case "running":
      return addressEnding(run.summary);
  }
}

/**
 * A running run whose model call waits for the answer to Studio's "Allow this address?" ends
 * with the oldest question and where to answer it: only Studio asks it, so the CLI can't take
 * the answer (HAL-16221). Any other running run ends with its step lines.
 */
function addressEnding(summary: RunSummary): Phrase[] {
  const wait = runWait(summary);
  if (wait.kind !== "address") {
    return [];
  }
  const { provider, key, origin } = wait.oldest;
  return [
    [],
    phrase`${markPart("needsYou")} ${runsMessages.showAddressQuestion(provider, key, origin).phrase}`,
    phrase`  ${runsMessages.showAnswerInStudio().phrase}`,
  ];
}

/**
 * The line under a finished run's receipt that says where to read what its
 * steps wrote (HAL-12073); none for a run that isn't finished, or whose
 * agents wrote nothing.
 */
export function outputHintLines(run: RunDetail, dir: string | undefined): Phrase[] {
  if (run.summary.status !== "completed" || !hasAgentOutput(run.events, run.summary)) {
    return [];
  }
  return [phrase`  ${runMessages.outputHint(shortRunId(run.summary.id), dir).phrase}`];
}

/**
 * A failed run, with what its lines need from the workspace: its title, its
 * workflow's steps and agents, and its models.
 */
interface EndedRun {
  readonly run: RunDetail;
  readonly title: string;
  readonly definitions: RunDefinitions;
  readonly models: () => WorkspaceModels;
}

/** The child run a failed run's step failed with (HAL-15555), read as {@link EndedRun}. */
export interface FailedChildEnding extends EndedRun {
  /** The for-each item it ran for, 0-based; `undefined` for a `workflow` step. */
  readonly item: number | undefined;
}

/**
 * The run a waiting run's answer goes to when it waits on a child run
 * (`app.waiting-child-run`), with the workflow and agents its lines name.
 */
export interface WaitingChildEnding {
  readonly summary: RunSummary;
  readonly definitions: RunDefinitions;
}

/** The child runs whose lines end the run that started them; either may be missing. */
export interface ChildEndings {
  readonly failed?: FailedChildEnding | undefined;
  readonly waiting?: WaitingChildEnding | undefined;
}

interface FailedEndingOptions {
  readonly dir: string | undefined;
  readonly debugging: boolean;
  readonly localOnlySaved: boolean;
  readonly child: FailedChildEnding | undefined;
}

/**
 * A failed or stopped run (cli-output 3.4, revision 31): its ✕ line 1, the
 * fix indented under it, then the receipt, the same two lines `halonic run`
 * prints when the run fails. A run cancelled somewhere else has one line,
 * where the cancel landed, and no fix (revision 28); so has a run whose
 * cause is known but has no words of its own yet (HAL-6451). A run
 * whose step failed because its child run failed says the child's cause
 * instead, with the way to that child. A child run, cancelled or failed,
 * has the way to its parent under its lines (HAL-15755, HAL-15864).
 */
function failedEnding(ended: EndedRun, options: FailedEndingOptions): Phrase[] {
  const { run, title } = ended;
  const failed = runFailedEvent(run);
  const named = stepNamer(ended.definitions);
  const step = named(failed.state ?? run.summary.state ?? "");
  const { dir, debugging, localOnlySaved } = options;
  const own = failureLines(ended, { dir, debugging, localOnlySaved });
  const lines =
    own === undefined
      ? [cancelledLine(run.summary, title, cancelledAt(run.events, failed, named))]
      : (childFailedLines(options, { title, step }) ?? own.lines);
  const [first = [], ...rest] = [...lines, ...parentRunLines(run.summary, options.dir)];
  const receipt = runMessages.receipt(receiptOf(run.events, run.summary)).phrase;
  return [
    [],
    phrase`${markPart("failed")} ${first}`,
    ...rest,
    ...(receipt.length === 0 ? [] : [phrase`  ${receipt}`]),
  ];
}

/**
 * A failed run's line 1 and its fix indented under it, from its
 * `run.failed`, with the reason they say; `undefined` for a cancelled run,
 * which has no failure. With `startedBy`, the run is a child whose parent
 * leads line 1.
 */
function failureLines(
  { run, title, definitions, models }: EndedRun,
  options: Pick<FailedRun, "dir" | "debugging" | "localOnlySaved" | "startedBy">,
): { readonly lines: Phrase[]; readonly reason: RunFailure["reason"] } | undefined {
  const failed = runFailedEvent(run);
  const failure = runFailureOf(
    failed,
    failedModelOf(run.events, models()),
    namedStart(failedStartOf(run.events, failed), definitions),
  );
  if (failure === undefined) {
    return undefined;
  }
  const failedRun = {
    ...options,
    title,
    step: stepNamer(definitions)(failed.state ?? run.summary.state ?? ""),
    runId: shortRunId(run.summary.id),
  };
  const { message, fix } = runFailedLines(failedRun, offOptionsNamed(failure, failed, definitions));
  const lines = fix === undefined ? [message.phrase] : [message.phrase, phrase`  ${fix.phrase}`];
  return { lines, reason: failure.reason };
}

/**
 * The lines of a run whose step failed because the child run it started
 * failed (HAL-15555): the child's own failure lines, led by the parent's
 * step, then the way to the child, as Studio's run page offers Open run.
 * `undefined` when there is no such child, or it was cancelled, so the
 * parent's own lines stay.
 */
function childFailedLines(
  { child, dir, debugging, localOnlySaved }: FailedEndingOptions,
  parent: { readonly title: string; readonly step: string },
): Phrase[] | undefined {
  if (child === undefined) {
    return undefined;
  }
  const lines = failureLines(child, {
    dir,
    debugging,
    localOnlySaved,
    startedBy: { ...parent, item: child.item },
  });
  if (lines === undefined) {
    return undefined;
  }
  // A turn limit's fix already says to see what the agent did with `runs show` of that child.
  if (lines.reason === "turn-limit") {
    return lines.lines;
  }
  const childId = shortRunId(child.run.summary.id);
  return [...lines.lines, phrase`  ${runsMessages.showChildRun(childId, dir).phrase}`];
}

/**
 * An answer that isn't one of the step's options, with its agent as its file
 * names it: "The agent Picker answered …", as the step line above names it
 * (HAL-15864). The engine's line names the agent by id; its typed cause says
 * which agent, so only that id is swapped. A line from a log without the
 * cause, or that doesn't start as the engine writes it, stays as it is.
 */
function offOptionsNamed(
  failure: RunFailure,
  failed: RunFailedEvent,
  definitions: RunDefinitions,
): RunFailure {
  const agent = answerChoicesOf(failed.cause)?.agent;
  if (failure.reason !== "error" || agent === undefined) {
    return failure;
  }
  const byId = offOptionsStart(agent);
  if (failure.message?.startsWith(byId) !== true) {
    return failure;
  }
  const byName = offOptionsStart(agentName(agent, definitions));
  return { ...failure, message: byName + failure.message.slice(byId.length) };
}

/** A step by the name its workflow gives it, as the step lines name it. */
function stepNamer(definitions: RunDefinitions): (stepId: string) => string {
  return (stepId) => stepName(stepId, definitions.workflow?.states[stepId]?.description);
}

/**
 * The failed step's start with its agent as its file names it, "Writer"
 * rather than `writer`, as the run's other lines and Studio name it
 * (HAL-15203); an agent the workspace no longer has keeps its id.
 */
function namedStart(
  started: FailedStart | undefined,
  definitions: RunDefinitions,
): FailedStart | undefined {
  return started === undefined
    ? undefined
    : { ...started, agent: agentName(started.agent, definitions) };
}

/**
 * What `--debug` prints under a failed run's lines (HAL-6613): what its
 * log holds about the failure, as {@link runFailureDetails} words it.
 *
 * @returns `undefined` for a run that didn't fail, or was cancelled, since
 *   a cancelled run has no failure to explain
 */
export function failedRunDebugText(run: RunDetail): string | undefined {
  if (run.summary.status !== "failed") {
    return undefined;
  }
  const failed = runFailedEvent(run);
  return failed.reason === "cancelled" ? undefined : runFailureDetails(run.events, failed);
}

/**
 * A Try it or Test run that ended at steps it couldn't try: neither done nor
 * failed, so it gets the ! mark, the steps it didn't run by name, then the
 * receipt.
 */
function cantTryEnding(run: RunDetail, title: string, definitions: RunDefinitions): Phrase[] {
  const states = definitions.workflow?.states ?? {};
  const steps = run.summary.cantTry.flatMap(({ step }) =>
    step === null ? [] : [stepName(step, states[step]?.description)],
  );
  const receipt = runMessages.receipt(receiptOf(run.events, run.summary)).phrase;
  return [
    [],
    phrase`${markPart("needsYou")} ${runsMessages.showCantTry(title).phrase}`,
    phrase`  ${runsMessages.cantTrySteps([...new Set(steps)]).phrase}`,
    ...(receipt.length === 0 ? [] : [phrase`  ${receipt}`]),
  ];
}

/**
 * The run's `run.failed`, the last event of a failed run's log. A log that
 * lacks it, cut off or damaged, gets one from its summary, which has the
 * reason and the engine's message but not the unreachable host, and is
 * placed after the log's last event.
 */
function runFailedEvent(run: RunDetail): RunFailedEvent {
  const last = run.events.findLast((event) => event.type === "run.failed");
  if (last !== undefined) {
    return last;
  }
  const { summary } = run;
  return {
    runId: summary.id,
    seq: run.events.length,
    at: summary.endedAt ?? summary.updatedAt,
    type: "run.failed",
    state: summary.state,
    error: summary.error ?? "",
    ...(summary.reason === null ? {} : { reason: summary.reason }),
  };
}

/**
 * A cancelled run's one line, which says so when the run that started it
 * ended (its typed cause, HAL-15555); a log written before the cause keeps
 * the plain line.
 */
function cancelledLine(summary: RunSummary, title: string, at: CancelledAt): Phrase {
  return endedWithParent(summary.cause)
    ? runsMessages.showCancelledWithParent(title, at).phrase
    : runsMessages.showCancelled(title, at).phrase;
}

/**
 * The way to the run that started this one, indented under its ending, as
 * Studio's run page has Open run (HAL-12411): for any child run, cancelled
 * whatever ended it, so a for-each item whose parent the person cancelled
 * still leads there (HAL-15755), or failed (HAL-15864). None for a run
 * nothing else started.
 */
function parentRunLines(summary: RunSummary, dir: string | undefined): Phrase[] {
  const parentId = summary.parentRunId;
  return parentId === null
    ? []
    : [phrase`  ${runsMessages.showParentRun(shortRunId(parentId), dir).phrase}`];
}

/**
 * Where the cancel landed: in the step the run last entered, when that is
 * the step `run.failed` names; between steps, before the one the run was
 * moving to; or before any step, when the run entered none.
 */
function cancelledAt(
  events: readonly RunEvent[],
  failed: RunFailedEvent,
  named: (stepId: string) => string,
): CancelledAt {
  const entered = events.findLast((event) => event.type === "state.entered");
  if (entered === undefined) {
    return { kind: "before-start" };
  }
  if (failed.state === null || failed.state === entered.state) {
    return { kind: "in-step", step: named(entered.state) };
  }
  return { kind: "before-step", step: named(failed.state) };
}

/**
 * A run waiting at a wait step ends with `run`'s two waiting lines, word for
 * word (cli-output 3.4): "! Waiting for you: Approve this reply?" and how to
 * answer. A run waiting for tool approvals has one "! Waiting for your
 * approval: Writer wants to use send_email (call call-1)" line for each, oldest first, and
 * the same answer line naming the oldest's call, so the command typed twice can't answer the
 * next one; a line under it says how to answer another (HAL-16382). A run
 * waiting for a time has no such lines; its step line already says what it waits for. A run
 * waiting for its child run ends with that child's lines instead, its id in the answer line, so
 * the person learns what the child asks and how to answer it (HAL-15951). What the run waits for
 * is {@link runWait}'s, so a run with an open approval and a child run asks for the approval, as
 * the list does (HAL-10646).
 */
function waitingEnding(
  summary: RunSummary,
  definitions: RunDefinitions,
  dir: string | undefined,
): Phrase[] {
  const { kind } = runWait(summary);
  if ((kind !== "approvals" && kind !== "step") || summary.accepts.length === 0) {
    return [];
  }
  const waiting = waitingLines(summary, definitions);
  if (waiting.length === 0) {
    return [];
  }
  const answer = runMessages.answerHere(
    shortRunId(summary.id),
    summary.accepts,
    dir,
    summary.answerLabels,
    summary.approvals[0]?.callId,
  );
  return [
    [],
    ...waiting.map((line) => phrase`${markPart("needsYou")} ${line}`),
    ...waitBodyLines(summary),
    phrase`  ${answer.phrase}`,
    ...(waiting.length > 1 ? [phrase`  ${runMessages.answerAnotherCall().phrase}`] : []),
  ];
}

/** What the run waits for, one phrase per thing, without the mark. */
function waitingLines(summary: RunSummary, definitions: RunDefinitions): Phrase[] {
  if (summary.approvals.length > 0) {
    return summary.approvals.map(
      ({ agent, subagent, tool, callId }) =>
        runMessages.waitingForApproval(
          definitions.agent(subagent ?? agent)?.name ?? subagent ?? agent,
          tool,
          callId,
        ).phrase,
    );
  }
  if (summary.state === null) {
    return [];
  }
  const description = waitDescription(summary, definitions.workflow);
  return [
    description === undefined
      ? runMessages.waitingInStep(
          stepName(summary.state, definitions.workflow?.states[summary.state]?.description),
        ).phrase
      : runMessages.waitingForYou(description).phrase,
  ];
}

/**
 * "✓ Support reply finished in 18 s.", the receipt under it, and the ending
 * the run reached when its workflow has more than one.
 */
function finishedEnding(run: RunDetail, title: string, definitions: RunDefinitions): Phrase[] {
  const { summary } = run;
  const took = Date.parse(summary.endedAt ?? summary.updatedAt) - Date.parse(summary.startedAt);
  const receipt = runMessages.receipt(receiptOf(run.events, summary)).phrase;
  const ending = runEnding(summary, definitions.workflow);
  return [
    [],
    phrase`${markPart("done")} ${runMessages.finished(title, duration(took)).phrase}`,
    ...(receipt.length === 0 ? [] : [phrase`  ${receipt}`]),
    ...(ending === undefined ? [] : [phrase`  ${runMessages.ending(ending).phrase}`]),
  ];
}
