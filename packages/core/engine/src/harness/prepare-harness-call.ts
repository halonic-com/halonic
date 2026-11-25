// What a harness call settles before anything starts: that it may run here,
// the harness it runs in, where the agent runs and that its sandbox is
// ready. The early hedge settles this once and then runs several attempts
// of the step on it (HAL-18800), so it is apart from running one attempt.

import { type Harness, ModelCallError, RunFailureError, type Sandbox } from "@halonicjs/ports";
import { SandboxNotReadyError } from "../run/sandbox-not-ready-error.ts";
import type { HarnessAgent, HarnessRunsOptions, PlacementAnswer } from "./harness-host.ts";
import type { HarnessCall } from "./run-harness-call.ts";

/** A harness call that may start: its harness, its agent, where it runs and that sandbox, checked. */
export interface PreparedHarnessCall {
  readonly harness: Harness;
  /** The agent, as the host's placement, bridge and profile are asked about it. */
  readonly agent: HarnessAgent;
  readonly placement: PlacementAnswer;
  readonly sandbox: Sandbox;
}

/**
 * Settles what a harness call needs before anything starts, as
 * `runHarnessCall` says.
 *
 * @throws {ModelCallError} `local-only` when the workspace is local only
 * @throws RunFailureError `harness-start-failed` when the host has no such harness
 * @throws SandboxNotReadyError when the sandbox check fails
 */
export async function prepareHarnessCall(
  options: HarnessRunsOptions,
  call: HarnessCall,
): Promise<PreparedHarnessCall> {
  const { effect } = call;
  if (options.localOnly === true) {
    throw new ModelCallError(
      "local-only",
      `Agent "${effect.agent}" runs in ${effect.harness}, which sends its work to its own cloud model, and the workspace is local only, so Halonic didn't start it.`,
    );
  }
  const harness = options.harnesses[effect.harness];
  if (harness === undefined) {
    throw new RunFailureError(
      "harness-start-failed",
      `Halonic can't start ${effect.harness} on this computer: the host offers no such harness.`,
    );
  }
  const agent: HarnessAgent = {
    runId: call.runId,
    hubId: call.hubId,
    agentId: effect.agent,
    harness: effect.harness,
    file: call.agent,
    version: call.version,
    ...(call.effort === undefined ? {} : { effort: call.effort }),
    filesFolder: call.filesFolder,
  };
  const placement = await options.placement.where(agent);
  const sandbox = options.sandboxes[placement.runsOn];
  const check = await sandbox.check();
  if (!check.ok) {
    const onHold = placement.runsOn === "sandbox" && placement.onHold === true;
    throw new SandboxNotReadyError(check.reason, effect.agent, { onHold });
  }
  return { harness, agent, placement, sandbox };
}
