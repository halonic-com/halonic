import type { Routine } from "@halonicjs/format";
import { render, renderText } from "@halonicjs/workflow";
import type { PlacedRoutine } from "./due.ts";
import { triggerValueProblems, UnknownTriggerValueError } from "./trigger-values.ts";

/** What a trigger tells the routine about its start, for the `{{trigger.*}}` placeholders. */
export interface TriggerFacts {
  /** When the run was due; for a manual start, when it was asked for. */
  at: Date;
  /** When the routine last ran, or `null` if it never did. */
  lastRun: Date | null;
  /** The mail message that started the run, for a mail trigger. */
  message?: unknown;
  /** The request body, for a webhook trigger: see {@link webhookFacts}. */
  body?: unknown;
  /** The request headers the routine asked for, by lowercase name, for a webhook trigger. */
  headers?: Readonly<Record<string, string>>;
  /** The signal's data, for a signal trigger. */
  signal?: Readonly<Record<string, unknown>>;
}

/** What a routine runs once its placeholders are filled in. */
export type RoutineStart =
  | { workflow: string; hub: string | null; input: Record<string, unknown> }
  | { agent: string; hub: string | null; prompt: string };

/**
 * What to run for a routine at a trigger: the target's hub (its own, or the
 * hub the routine lives in), and its input or prompt with the `{{trigger.*}}`
 * placeholders filled in.
 *
 * A placeholder that isn't one of the trigger's values (see
 * {@link triggerValueProblems}) stops the start, so a run never starts with
 * an empty text or without the input key it names.
 *
 * @example
 * routineStart(placed, { at: new Date("2026-01-02T08:00:00Z"), lastRun: null });
 * // { workflow: "digest", hub: "h", input: { since: null } }
 *
 * @throws UnknownTriggerValueError with the first placeholder that isn't a value of the trigger,
 *   such as "{{trigger.date}} isn't a trigger value. Use {{trigger.at}} or {{trigger.lastRun}}."
 */
export function routineStart(placed: PlacedRoutine, trigger: TriggerFacts): RoutineStart {
  const run: Routine["run"] = placed.routine.run;
  const problem = triggerValueProblems(placed.routine)[0];
  if (problem !== undefined) {
    throw new UnknownTriggerValueError(problem);
  }
  const hub = run.hub ?? placed.hub;
  const scope = {
    trigger: {
      at: trigger.at.toISOString(),
      lastRun: trigger.lastRun?.toISOString() ?? null,
      message: trigger.message,
      body: trigger.body,
      headers: trigger.headers ?? {},
      signal: trigger.signal,
    },
  };
  if ("workflow" in run) {
    const input = Object.fromEntries(
      Object.entries(run.input).map(([key, value]) => [key, render(value, scope)]),
    );
    return { workflow: run.workflow, hub, input };
  }
  return { agent: run.agent, hub, prompt: renderText(run.prompt, scope) };
}
