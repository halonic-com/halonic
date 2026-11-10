import type { Agent } from "@halonicjs/format";
import type { Effect, ProgramHarness } from "./decide-types.ts";
import type { PendingCall } from "./run-state.ts";

/**
 * The effect that runs an agent for a call: one model call, or, when the
 * agent's file names a harness other than Halonic's own loop, one harness run.
 */
export function agentCallEffect(
  agents: Readonly<Record<string, Agent>>,
  call: Pick<PendingCall, "callId" | "state" | "agent" | "prompt">,
): Effect {
  const harness = programHarnessOf(agents, call.agent);
  return harness === null
    ? { type: "call-model", ...call }
    : { type: "run-harness", ...call, harness };
}

/**
 * The harness that starts a program for the agent, or `null` when Halonic's
 * own loop runs it: when its file says so, names no harness, or isn't among
 * the run's definitions (runs kept before agents joined them).
 */
export function programHarnessOf(
  agents: Readonly<Record<string, Agent>>,
  agentId: string,
): ProgramHarness | null {
  const harness = Object.hasOwn(agents, agentId) ? agents[agentId]?.harness : undefined;
  return harness === undefined || harness === "halonic" ? null : harness;
}
