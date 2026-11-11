// How `halonic runs show` ends, after the step lines (cli-output 3.4): a
// finished run as a finished `halonic run` ends, a failed or stopped run
// with `run`'s failure lines, a waiting run with `run`'s waiting lines.
// Every sentence is the catalogue's.

import { type RunDetail, shortRunId } from "@halonicjs/app";
import type { RunEvent, RunSummary } from "@halonicjs/events";
import { duration } from "../../messages/duration.ts";
import { markPart, type Phrase, phrase } from "../../messages/phrase.ts";
import { runMessages } from "../../messages/run.ts";
import { runFailedLines } from "../../messages/run-failures.ts";
import { type CancelledAt, runsMessages } from "../../messages/runs.ts";
import { stepName } from "../../messages/step-name.ts";
import {
  failedModelOf,
  type RunFailedEvent,
  runFailureOf,
  type WorkspaceModels,
} from "../../run-failure-of.ts";
import { type RunDefinitions, receiptOf } from "../../run-view.ts";
import { waitDescription } from "./listed-run.ts";

/**
 * What follows the step lines: a finished run's "✓ Support reply finished
 * in 18 s." and the receipt under it, as a finished `halonic run` ends; a
 * failed or stopped run's ✕ line, its fix and the receipt; or a waiting
 * run's two waiting lines. A running run ends with its step lines.
 *
 * @param models - the workspace's models, read only for a failed run
 */
export function showEnding(
  run: RunDetail,
  title: string,
  definitions: RunDefinitions,
  models: () => WorkspaceModels,
  dir: string | undefined,
): Phrase[] {
  switch (run.summary.status) {
    case "completed":
      return finishedEnding(run, title);
    case "failed":
      return failedEnding(run, title, definitions, models, dir);
    case "cant-try":
      return cantTryEnding(run, title, definitions);
    case "waiting":
      return waitingEnding(run.summary, definitions, dir);
    case "running":
      return [];
  }
}

/**
 * A failed or stopped run (cli-output 3.4, revision 31): its ✕ line 1, the
 * fix indented under it, then the receipt, the same two lines `halonic run`
 * prints when the run fails. A run cancelled somewhere else has one line,
 * where the cancel landed, and no fix (revision 28).
 */
function failedEnding(
  run: RunDetail,
  title: string,
  definitions: RunDefinitions,
  models: () => WorkspaceModels,
  dir: string | undefined,
): Phrase[] {
  const failed = runFailedEvent(run);
  const named = (stepId: string) =>
    stepName(stepId, definitions.workflow?.states[stepId]?.description);
  const failure = runFailureOf(failed, failedModelOf(run.events, models()));
  let lines: Phrase[];
  if (failure === undefined) {
    lines = [runsMessages.showCancelled(title, cancelledAt(run.events, failed, named)).phrase];
  } else {
    const failedRun = {
      title,
      step: named(failed.state ?? run.summary.state ?? ""),
      runId: shortRunId(run.summary.id),
      dir,
    };
    const { message, fix } = runFailedLines(failedRun, failure);
    lines = [message.phrase, phrase`  ${fix.phrase}`];
  }
  const [first = [], ...rest] = lines;
  const receipt = runMessages.receipt(receiptOf(run.events, run.summary)).phrase;
  return [
    [],
    phrase`${markPart("failed")} ${first}`,
    ...rest,
    ...(receipt.length === 0 ? [] : [phrase`  ${receipt}`]),
  ];
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
 * answer. A run waiting for a tool approval, its child run or a time has no
 * such lines in 3.4; its step line already says what it waits for.
 */
function waitingEnding(
  summary: RunSummary,
  definitions: RunDefinitions,
  dir: string | undefined,
): Phrase[] {
  const waitsAtAWaitStep =
    summary.approvals.length === 0 && summary.waitingOn === null && summary.accepts.length > 0;
  if (!waitsAtAWaitStep || summary.state === null) {
    return [];
  }
  const description = waitDescription(summary, definitions.workflow);
  const waiting =
    description === undefined
      ? runMessages.waitingInStep(
          stepName(summary.state, definitions.workflow?.states[summary.state]?.description),
        )
      : runMessages.waitingForYou(description);
  const answer = runMessages.answerHere(
    shortRunId(summary.id),
    summary.accepts,
    dir,
    summary.answerLabels,
  );
  return [[], phrase`${markPart("needsYou")} ${waiting.phrase}`, phrase`  ${answer.phrase}`];
}

/** "✓ Support reply finished in 18 s." and the receipt under it. */
function finishedEnding(run: RunDetail, title: string): Phrase[] {
  const { summary } = run;
  const took = Date.parse(summary.endedAt ?? summary.updatedAt) - Date.parse(summary.startedAt);
  const receipt = runMessages.receipt(receiptOf(run.events, summary)).phrase;
  return [
    [],
    phrase`${markPart("done")} ${runMessages.finished(title, duration(took)).phrase}`,
    ...(receipt.length === 0 ? [] : [phrase`  ${receipt}`]),
  ];
}
