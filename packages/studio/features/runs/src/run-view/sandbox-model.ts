// What a step could do (sandbox-screens 1; requirement
// `runs.run-view.sandbox-panel`): read from the step's `sandbox.opened` or
// `sandbox.off` event, never from the agent's current settings, so a finished
// run keeps what it could do then.

import { type RunEvent, readSandboxOpened, type SandboxOpenedView } from "@halonicjs/events";
import { escapeHidden } from "@halonicjs/std";
import { stepName } from "../run-words.ts";
import { eventsOfStep } from "./step-events-model.ts";

/** What the log says about the sandbox of one program a step started. */
export type StepSandbox =
  /** It ran in a sandbox, and the event could be read. */
  | { readonly kind: "opened"; readonly agent: string; readonly view: SandboxOpenedView }
  /** The event is there but damaged or from another version: say so, show nothing of it. */
  | { readonly kind: "unreadable"; readonly agent: string }
  /** A person chose On this computer: no sandbox. */
  | { readonly kind: "off"; readonly agent: string };

/**
 * What the sandbox of the step whose entry is `entryId` could do, one item for each program the
 * step started. Empty for a step with no program, and for a run from before the log recorded
 * this (requirement `runs.run-view.sandbox-panel`), which shows no line.
 *
 * @example
 * stepSandboxes(events, "step-1");
 * // [{ kind: "opened", agent: "Writer", view: { strength: "os", workingFolder: "~/work", … } }]
 */
export function stepSandboxes(events: readonly RunEvent[], entryId: string): StepSandbox[] {
  return eventsOfStep(events, entryId).flatMap((event): StepSandbox[] => {
    if (event.type === "sandbox.off") {
      return [{ kind: "off", agent: stepName(escapeHidden(event.agent), undefined) }];
    }
    if (event.type !== "sandbox.opened") return [];
    const agent = stepName(escapeHidden(event.agent), undefined);
    const view = readSandboxOpened(event.sandbox);
    return [view === null ? { kind: "unreadable", agent } : { kind: "opened", agent, view }];
  });
}

/**
 * Whether the Blocked sites hint may say "No connection was made." for the step whose entry is
 * `entryId` (requirement `runs.run-view.blocked-sites`): only when each program the step started
 * ran in an `os` sandbox. That is srt, whose fence suites prove no connection is made to a site
 * its proxy refuses, on Linux, macOS and Windows (HAL-6219, HAL-12648). False for a `vm` or
 * `remote` sandbox, an unreadable event, a step that ran without the sandbox, and an old run
 * with no `sandbox.opened`.
 *
 * MXC is an `os` sandbox too and has no such suite yet. Nothing turns it on (HAL-2546); before
 * something does, the log has to tell it apart from srt, or MXC has to pass the suite.
 *
 * @example
 * noConnectionProven(events, "step-1"); // true: the step's one program ran in srt
 */
export function noConnectionProven(events: readonly RunEvent[], entryId: string): boolean {
  const sandboxes = stepSandboxes(events, entryId);
  return (
    sandboxes.length > 0 &&
    sandboxes.every((sandbox) => sandbox.kind === "opened" && sandbox.view.strength === "os")
  );
}

/** The unit words of {@link timeLimitParts}: a count and which unit it is in. */
export interface TimePart {
  readonly unit: "seconds" | "minutes" | "hours";
  readonly count: number;
}

/**
 * A time limit as the parts it is said in: under a minute in seconds, under an hour in minutes,
 * otherwise hours and the minutes left ("1 hour 30 minutes"). A part of 0 is left out.
 *
 * @example
 * timeLimitParts(5_400_000); // [{ unit: "hours", count: 1 }, { unit: "minutes", count: 30 }]
 */
export function timeLimitParts(ms: number): TimePart[] {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return [{ unit: "seconds", count: totalSeconds }];
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return [{ unit: "minutes", count: minutes }];
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? [{ unit: "hours", count: hours }]
    : [
        { unit: "hours", count: hours },
        { unit: "minutes", count: rest },
      ];
}
