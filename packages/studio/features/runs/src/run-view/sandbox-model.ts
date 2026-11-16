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
