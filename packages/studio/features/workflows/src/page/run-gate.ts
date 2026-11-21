import type { SandboxStartCheck } from "@halonicjs/app";
import { type SandboxStart, useSandboxStart } from "@halonicjs/studio-feature-runs/api";
import type { ButtonUnavailable } from "@halonicjs/studio-kit";
import { useId } from "react";
import { type ProgramStep, programStepsOf } from "./program-steps-line.tsx";
import type { WorkflowLoad } from "./use-workflow.ts";

/** What the workflow page's Run and its can't-run Callout need (requirement `workflows.page.cant-run`). */
export interface RunGate {
  /** The steps that start a program, which the Callout's last line names. */
  readonly programSteps: readonly ProgramStep[];
  readonly sandbox: SandboxStart;
  /** The `id` of the Callout's first line, which describes Run while it is unavailable. */
  readonly cantRunId: string;
  /** Run's `unavailable` while the sandbox can't start; `undefined` while it can. */
  readonly unavailable: ButtonUnavailable | undefined;
}

/**
 * Whether the workflow page's Run can start a run: it needs the sandbox only when a step starts a
 * program, which it knows once the workflow is read, and only a check that refuses makes it
 * unavailable (checklist 3.1).
 */
export function useRunGate(
  load: WorkflowLoad,
  canStart: boolean,
  check: SandboxStartCheck | undefined,
): RunGate {
  const programSteps = programStepsOf(load.kind === "ready" ? load.value : undefined);
  const sandbox = useSandboxStart(check, canStart && programSteps.length > 0);
  const cantRunId = useId();
  const refused = sandbox.refused !== undefined;
  return {
    programSteps,
    sandbox,
    cantRunId,
    unavailable: refused ? { reason: cantRunId } : undefined,
  };
}

/**
 * Run's `unavailable` from every reason that holds, such as the workflow's errors, the sandbox's
 * and the files' refusal
 * (`workflows.start.start-run`): unavailable while any holds, and described by each first line, in
 * the order the page shows them. `undefined` while none holds.
 */
export function unavailableFor(
  ...reasons: readonly (ButtonUnavailable | undefined)[]
): ButtonUnavailable | undefined {
  const ids = reasons.flatMap((one) => (one === undefined ? [] : [one.reason]));
  return ids.length === 0 ? undefined : { reason: ids.join(" ") };
}
