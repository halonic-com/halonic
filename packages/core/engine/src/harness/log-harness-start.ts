import type { Harness } from "@halonicjs/ports";
<<<<<<< HEAD
import { checkInstructionTrust } from "./check-instruction-trust.ts";
import type { HarnessAgent, HarnessInstructionsPin, HarnessRunsOptions } from "./harness-host.ts";
import type { HarnessCall, HarnessEventLog } from "./run-harness-call.ts";
import type { StartLimits } from "./start-limits.ts";

/** What `logHarnessStart` needs of a started harness call. */
interface HarnessStartCall {
  readonly options: HarnessRunsOptions;
  readonly call: HarnessCall;
  readonly agent: HarnessAgent;
  readonly harness: Harness;
  readonly log: HarnessEventLog;
  readonly limits: StartLimits;
}

/**
 * Checks the run's instructions are trusted, writes `harness.instructions`
 * when the run has instruction files, and then writes `harness.started`.
 *
 * @param pin - the pin of the run's instructions, or `null` when it has none
 * @param trustTimeoutMs - how long the host's trust check may take before the start is refused
 * @throws InstructionsNotTrustedError when the host checks instruction trust and a person must be asked, or the check doesn't answer in time
 * @throws what the log throws; the harness doesn't start
 */
export async function logHarnessStart(
  { options, agent, call, harness, log, limits }: HarnessStartCall,
  pin: HarnessInstructionsPin | null,
  timeoutMs: number,
  trustTimeoutMs: number,
): Promise<void> {
  const { state, agent: agentId } = call.effect;
  await checkInstructionTrust(options.instructionTrust, agent, pin, {
    limits,
    timeoutMs: trustTimeoutMs,
  });
  if (pin !== null) {
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
