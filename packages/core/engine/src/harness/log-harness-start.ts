import type { Harness } from "@halonicjs/ports";
import type { HarnessAgent, HarnessRunsOptions } from "./harness-host.ts";
import type { HarnessCall, HarnessEventLog } from "./run-harness-call.ts";

/** What `logHarnessStart` needs of a started harness call. */
interface HarnessStartCall {
  readonly options: HarnessRunsOptions;
  readonly call: HarnessCall;
  readonly agent: HarnessAgent;
  readonly harness: Harness;
  readonly log: HarnessEventLog;
}

/**
 * Writes `harness.instructions`, when the host has instruction files for the
 * agent, and then `harness.started`.
 *
 * @throws what the host's instruction source or the log throws; the harness doesn't start
 */
export async function logHarnessStart(
  { options, agent, call, harness, log }: HarnessStartCall,
  timeoutMs: number,
): Promise<void> {
  const { state, agent: agentId } = call.effect;
  const pin = await options.instructions?.pinOf(agent);
  if (pin !== undefined && pin !== null) {
    await log.append({
      type: "harness.instructions",
      state,
      agent: agentId,
      files: pin.files.map(({ path, sha256 }) => ({ path, sha256 })),
      sha256: pin.sha256,
    });
  }
  await log.append({
    type: "harness.started",
    state,
    agent: agentId,
    harness: harness.id,
    timeoutMs,
  });
}
