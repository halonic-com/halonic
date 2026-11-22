// The quiet line in a step's panel for a harness program Halonic stopped after it gave its result
// (`runs.run-view.step-harness-stopped`, HAL-15988). The step succeeded, so the line is a note,
// not a failure: no ✕, no icon, and nothing about it changes the step's or the run's status.

import type { RunEvent } from "@halonicjs/events";
import { escapeHidden } from "@halonicjs/std";
import { failureWords } from "../failure-words.ts";
import { capitalised } from "../run-words.ts";
import { eventsOfStep } from "./step-events-model.ts";

/**
 * The line's words, decided by the team (Sofia, HAL-15988, HAL-2282). "Stop on its own" rather
 * than "exit", and "gave its result" rather than "finished", which reads as if it had stopped.
 */
export const harnessStoppedWords = {
  noExitAfterResult: (harness: string, seconds: number) =>
    `${harness} gave its result but didn't stop on its own, so Halonic stopped it after ${seconds} ${seconds === 1 ? "second" : "seconds"}. The step kept its result.`,
};

/** One `harness.stopped` of a step, as the panel says it. */
export interface HarnessStoppedLine {
  /** The `seq` of its `harness.stopped`. */
  readonly id: number;
  /** "Claude Code gave its result but didn't stop on its own, …". */
  readonly text: string;
}

/**
 * One line for each `harness.stopped` in the step whose entry is `entryId`, in the order they
 * were written. Only the reason `no-exit-after-result` has words; the log is read from a file, so
 * an event with another reason gets no line here and only the run log shows it.
 *
 * @example
 * stepHarnessStopped(events, "step-1");
 * // [{ id: 9, text: "Claude Code gave its result but didn't stop on its own, so Halonic stopped it after 10 seconds. The step kept its result." }]
 */
export function stepHarnessStopped(
  events: readonly RunEvent[],
  entryId: string,
): HarnessStoppedLine[] {
  return eventsOfStep(events, entryId).flatMap((event) =>
    event.type === "harness.stopped" && event.reason === "no-exit-after-result"
      ? [
          {
            id: event.seq,
            text: harnessStoppedWords.noExitAfterResult(
              harnessName(event.harness),
              wholeSeconds(event.afterMs),
            ),
          },
        ]
      : [],
  );
}

/** "Claude Code", "Codex", or an unknown id with its first letter made a capital, escaped. */
function harnessName(harness: string): string {
  return escapeHidden(failureWords.harnessNames[harness] ?? capitalised(harness));
}

/** `afterMs` in whole seconds, at least 1, so a short wait never reads "after 0 seconds". */
function wholeSeconds(afterMs: number): number {
  return Math.max(1, Math.round(afterMs / 1000));
}
