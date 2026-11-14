import type { AgentSandboxHost } from "../api.ts";
import type { SandboxOutcome } from "./sandbox-state.ts";
import * as text from "./sandbox-text.ts";

/**
 * Sets the sandbox up through the host and checks it. `cause` is null when it is ready, else the
 * phrase to put after "The agent sandbox isn't set up:". Never throws.
 */
export async function setUpForToast(host: AgentSandboxHost): Promise<{ cause: string | null }> {
  try {
    const failure = await host.setUp();
    if (failure !== null) return { cause: causeOf(failure) };
    const check = await host.check();
    if (check.state === "ready") return { cause: null };
    if (check.state === "restart-needed") return { cause: text.RESTART_CAUSE };
    return { cause: "reason" in check ? check.reason : text.STILL_NEEDS_SETUP };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { cause: `${message.replace(/\.+$/, "")}.` };
  }
}

function causeOf(outcome: SandboxOutcome): string {
  if (outcome.kind !== "setup") return text.STILL_NEEDS_SETUP;
  if (outcome.how === "cancelled") return text.DENIED_CAUSE;
  if (outcome.how === "timed-out") return text.TIMED_OUT_CAUSE;
  return outcome.reason;
}
