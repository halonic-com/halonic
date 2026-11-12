// The parts a step ran side by side (checklist part 1, 1.10): the branches
// of a parallel state, by name, and the items of a for-each state, by
// place. The page only draws what this returns.

import type { RunEvent } from "@halonicjs/events";
import { escapeHidden } from "@halonicjs/std";
import { everyStepWords, stepGroupWords } from "../run-words.ts";
import { clockTime, tookWords } from "../time-words.ts";

/** Whether the step is still going or already over. */
export type StepOutcome = "running" | "over";

/** One branch or item of a step, drawn under the step's entry. */
export interface StepGroup {
  /** Stable: the step's id and the branch's name or the item's index, "step-1:branch:summarise". */
  readonly id: string;
  /** "summarise" or "Item 2 of 5". */
  readonly name: string;
  readonly mark: "done" | "failed" | "running" | "stopped";
  /** "Took 2 s", "Failed after 2 s", "Running", "Didn't finish". */
  readonly line: string;
  /** When the part started, "10:41". */
  readonly time: string;
  /** What a screen reader hears, state first. */
  readonly label: string;
}

/** A part as it's read from the step's events. */
interface Part {
  readonly key: string;
  readonly branch: string | undefined;
  readonly item: number | undefined;
  readonly startedAt: string;
  end: { readonly at: string; readonly failed: boolean } | undefined;
}

/**
 * The branches and items of one step, from its events (`eventsOfStep`).
 * Branches are in the order they started, items in list order. A part
 * ends with its `agent.finished` or `workflow.finished`. A part with no
 * end while the step is still `running` is running; once the step is over
 * it is "Didn't finish". A for-each's total is known only when the step
 * `ended` fine, because the log never says how long the list was.
 *
 * @example
 * stepGroups(eventsOfStep(events, "step-1"), "step-1", "over", true);
 * // [{ id: "step-1:item:0", name: "Item 1 of 2", mark: "done", line: "Took 3 s", … }, …]
 */
export function stepGroups(
  events: readonly RunEvent[],
  stepId: string,
  outcome: StepOutcome,
  endedFine: boolean,
): StepGroup[] {
  const parts = new Map<string, Part>();
  for (const event of events) {
    if (event.branch === undefined && event.item === undefined) {
      continue;
    }
    const key = event.branch === undefined ? `item:${event.item}` : `branch:${event.branch}`;
    let part = parts.get(key);
    if (part === undefined) {
      part = { key, branch: event.branch, item: event.item, startedAt: event.at, end: undefined };
      parts.set(key, part);
    }
    if (event.type === "agent.finished") {
      part.end = { at: event.at, failed: event.error !== undefined };
    } else if (event.type === "workflow.finished") {
      part.end = { at: event.at, failed: event.status !== "completed" };
    }
  }
  const ordered = [...parts.values()].sort((a, b) => (a.item ?? 0) - (b.item ?? 0));
  const total = endedFine ? ordered.filter((part) => part.item !== undefined).length : undefined;
  return ordered.map((part) => group(part, stepId, outcome, total));
}

function group(
  part: Part,
  stepId: string,
  outcome: StepOutcome,
  total: number | undefined,
): StepGroup {
  const name =
    part.branch === undefined
      ? stepGroupWords.item((part.item ?? 0) + 1, total)
      : escapeHidden(part.branch);
  const time = clockTime(new Date(part.startedAt));
  const words = everyStepWords;
  let mark: StepGroup["mark"];
  let state: string;
  let line: string;
  if (part.end !== undefined) {
    const took = tookWords(Date.parse(part.end.at) - Date.parse(part.startedAt));
    [mark, state, line] = part.end.failed
      ? ["failed", words.state.failed, words.failed(took)]
      : ["done", words.state.done, words.took(took)];
  } else if (outcome === "running") {
    [mark, state, line] = ["running", words.state.running, words.running];
  } else {
    [mark, state, line] = ["stopped", words.state.stopped, stepGroupWords.unfinished];
  }
  return {
    id: `${stepId}:${part.key}`,
    name,
    mark,
    line,
    time,
    label: [part.branch === undefined ? name : stepGroupWords.branch(name), state, time, line].join(
      ", ",
    ),
  };
}
