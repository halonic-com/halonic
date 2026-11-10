import { AGENT_HARNESSES, type Agent } from "@halonicjs/format";
import type { Effect, ProgramHarness } from "./decide-types.ts";
import type { PendingCall, RunState } from "./run-state.ts";

/**
 * The effect that runs an agent for a call: one model call, or, when the run
 * or the agent's file names a harness other than Halonic's own loop, one
 * harness run.
 */
export function agentCallEffect(
  run: Pick<RunState, "harness">,
  agents: Readonly<Record<string, Agent>>,
  call: Pick<PendingCall, "callId" | "state" | "agent" | "prompt">,
): Effect {
  const harness = programHarnessOf(run, agents, call.agent);
  return harness === null
    ? { type: "call-model", ...call }
    : { type: "run-harness", ...call, harness };
}

/**
 * The harness that starts a program for the agent in this run, or `null`
 * when Halonic's own loop runs it. The run's own harness, as
 * `halonic run --harness` sets it, comes before the one the agent's file
 * names. An agent whose file says `halonic` or names no harness runs in
 * Halonic's own loop, and so does one that isn't among the run's
 * definitions (runs kept before agents joined them). A `harness` in a log
 * that this engine doesn't know, from a newer one, falls back to Halonic's
 * own loop as well.
 */
export function programHarnessOf(
  run: Pick<RunState, "harness">,
  agents: Readonly<Record<string, Agent>>,
  agentId: string,
): ProgramHarness | null {
  if (!Object.hasOwn(agents, agentId)) return null;
  const harness = run.harness ?? agents[agentId]?.harness;
  return harness !== undefined && isProgramHarness(harness) ? harness : null;
}

function isProgramHarness(harness: string): harness is ProgramHarness {
  return harness !== "halonic" && AGENT_HARNESSES.includes(harness);
}
