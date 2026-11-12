// Every step on the run page (checklist part 1, 1.10; component specs 24.2
// and 23.5): one entry for each step the run reached, read by `runSteps`,
// the same steps `halonic runs show` prints. The page only draws what
// this returns.

import { type RunStep, runSteps, type StepEnd, shortRunId } from "@halonicjs/app";
import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { RunWorkflow } from "../api.ts";
import { everyStepWords, stepName } from "../run-words.ts";
import { clockTime, dueWords, tookWords } from "../time-words.ts";
import { eventsOfStep } from "./step-events-model.ts";
import { type StepGroup, stepGroups } from "./step-groups.ts";

/** The 16px dot's mark (component specs 23.5); the run page has no "not reached" entries yet. */
export type StepMark = "done" | "failed" | "needs-you" | "running" | "stopped";

/** One step on the timeline. */
export interface StepEntry {
  /** Its place in the run, "step-0": steps are only ever added, so it stays the same as the run goes on. */
  readonly id: string;
  /** The step's plain name, "Draft reply". */
  readonly name: string;
  readonly mark: StepMark;
  /** What happened, in one line: "Took 9 s", "Waiting for your approval". */
  readonly line: string;
  /** When the run entered the step, "10:41". */
  readonly time: string;
  /** What a screen reader hears, state first (mc 19.3): "Draft reply, failed, 10:41, Failed after 2 s". */
  readonly label: string;
  /** The branches or for-each items the step ran, in order; empty for a step that ran none. */
  readonly groups: readonly StepGroup[];
}

/**
 * The timeline of one run, in the order it reached its steps. A step the
 * run failed in is a cancelled or budget stop when the run's reason says
 * so; a step the user answered is done.
 *
 * @example
 * everyStep(events, summary, workflow, now);
 * // [{ id: "step-0", name: "Read", mark: "done", line: "Took 1 s", time: "10:40", … },
 * //  { id: "step-1", name: "Draft", mark: "running", line: "Running", time: "10:40", … }]
 */
export function everyStep(
  events: readonly RunEvent[],
  summary: RunSummary,
  workflow: RunWorkflow | undefined,
  now: Date,
): StepEntry[] {
  return runSteps(events, summary).map((step, index) => {
    const name = stepName(step.stateId, workflow?.stepDescription(step.stateId));
    const time = clockTime(new Date(step.startedAt));
    const { mark, state, line } = howItWent(step, summary, now);
    const id = `step-${index}`;
    const over = step.end.kind !== "running" && !step.end.kind.startsWith("waiting");
    return {
      id,
      name,
      mark,
      line,
      time,
      // The cancelled state word already says it, so its line stays out of the label (mc 19.3).
      label: (mark === "stopped" && line === everyStepWords.cancelled
        ? [name, state, time]
        : [name, state, time, line]
      ).join(", "),
      groups: stepGroups(
        eventsOfStep(events, id),
        id,
        over ? "over" : "running",
        step.end.kind === "done" || step.end.kind === "answered",
      ),
    };
  });
}

/** The step's mark, the state word a screen reader hears first, and its line. */
function howItWent(
  step: RunStep,
  summary: RunSummary,
  now: Date,
): { readonly mark: StepMark; readonly state: string; readonly line: string } {
  const end: StepEnd = step.end;
  const words = everyStepWords;
  switch (end.kind) {
    case "done":
      return { mark: "done", state: words.state.done, line: words.took(tookWords(end.tookMs)) };
    case "answered":
      return {
        mark: "done",
        state: words.state.done,
        line: words.answered(end.event, clockTime(new Date(end.at))),
      };
    case "failed":
      if (summary.reason === "cancelled") {
        return { mark: "stopped", state: words.state.cancelled, line: words.cancelled };
      }
      if (summary.reason === "budget") {
        return {
          mark: "stopped",
          state: words.state.stopped,
          line: words.budget(tookWords(end.tookMs)),
        };
      }
      return {
        mark: "failed",
        state: words.state.failed,
        line: words.failed(tookWords(end.tookMs)),
      };
    case "waitingForYou":
      return { mark: "needs-you", state: words.state.needsYou, line: words.waitingForYou };
    case "waitingForApproval":
      return { mark: "needs-you", state: words.state.needsYou, line: words.waitingForApproval };
    case "waitingUntil":
      return {
        mark: "running",
        state: words.state.waiting,
        line: words.waitingUntil(dueWords(new Date(end.due), now)),
      };
    case "waitingForChildRun":
      return {
        mark: "running",
        state: words.state.waiting,
        line: words.waitingForChildRun(shortRunId(end.childRunId)),
      };
    case "running":
      return { mark: "running", state: words.state.running, line: words.running };
  }
}
