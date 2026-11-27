/**
 * The stepper run's stop on a definition's `requires` rules (`action-steppers.shell-check-gate`):
 * before a step runs, the checks before it must have run and kept what the definition requires.
 * A broken rule stops the request the same way a changed `expect` does (`expect-stop.ts`), with
 * the definition's own reason. The record is the one place kept values live, so a request opened
 * again stops in the same place.
 */
import {
  checkStepGate,
  type GateResult,
  type KeptByStep,
  type StepperCatalog,
} from "@halonicjs/action-steppers";
import type { ActionKeptValue } from "@halonicjs/events";
import type { InboxActionRequest } from "@halonicjs/ports";
import type { ExpectStop } from "./expect-stop.ts";
import type { RecordState } from "./record-fold.ts";

/** What each step that succeeded kept, by step number. */
function keptByStep(record: RecordState): KeptByStep {
  const kept = new Map<number, Readonly<Record<string, ActionKeptValue>>>();
  for (const [step, event] of record.steps) {
    if (event.type === "action.step.succeeded") kept.set(step, event.kept);
  }
  return kept;
}

/** Whether step `step` may run after the checks before it, from the record. */
export function gateRefusal(
  catalog: StepperCatalog,
  action: InboxActionRequest,
  step: number,
  record: RecordState,
): GateResult {
  const { definition: id, version } = action;
  const definition = catalog.definition(id, version) ?? catalog.stepType(id, version);
  // The review already refused a request whose definition isn't in the catalog.
  if (definition === undefined) return { ok: true };
  return checkStepGate(definition, step, action.expect ?? {}, keptByStep(record));
}

/**
 * The stop for the next step when a check before it broke one of the definition's `requires`
 * rules; `undefined` otherwise. A check that hasn't run yet doesn't stop the request: it only
 * keeps the step after it from being sent.
 */
export function requiresStop(
  catalog: StepperCatalog,
  action: InboxActionRequest,
  next: number,
  record: RecordState,
): ExpectStop | undefined {
  const gate = gateRefusal(catalog, action, next, record);
  if (gate.ok || gate.cause !== "requires") return undefined;
  return { message: gate.message, changes: [] };
}
