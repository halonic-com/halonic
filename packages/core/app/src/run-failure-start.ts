// Reads why a step's program didn't start from the run log: its sandbox, the
// launcher on this computer, or the harness program itself. Each names the
// agent of the step the log's last start names (`failedStartOf`). The facts
// are data; the CLI and Studio word them.

import type { FailedStart, RunFailedEvent } from "./failed-model.ts";

/** The reasons a step's program didn't start, each with its own facts. */
export type StartFailure =
  | {
      readonly reason: "sandbox-start-failed";
      readonly agent: string;
      /** The `Sandbox` port's reason code from the run log; left out when the log has none. */
      readonly code?: string;
    }
  | {
      readonly reason: "this-computer-start-failed";
      readonly agent: string;
      /** Why the launcher on this computer didn't open, as the run log gives it; never a sandbox. */
      readonly launcherReason: string;
    }
  | {
      readonly reason: "harness-start-failed";
      readonly agent: string;
      /** The harness program's id, such as "claude-code". */
      readonly harness: string;
      /** Why it didn't start, when the run log says. */
      readonly cause?: "not-installed" | "signed-out";
      /** How long the engine waited for its first event. */
      readonly withinMs: number;
    };

/**
 * The facts of a run whose step's program didn't start.
 *
 * @param reason - the engine's reason on `run.failed`
 * @param started - from `failedStartOf`
 * @returns `undefined` when the log doesn't hold the start the facts need
 */
export function startFailureOf(
  reason: StartFailure["reason"],
  failed: RunFailedEvent,
  started: FailedStart | undefined,
): StartFailure | undefined {
  if (started === undefined) {
    return undefined;
  }
  switch (reason) {
    case "sandbox-start-failed":
      return {
        reason,
        agent: started.agent,
        // Left out for a log from before the engine named it.
        ...(failed.sandboxReason === undefined ? {} : { code: failed.sandboxReason }),
      };
    // The engine logs the launcher's reason as the error (requirement `engine.this-computer-start-failed`).
    case "this-computer-start-failed":
      return { reason, agent: started.agent, launcherReason: failed.error };
    case "harness-start-failed":
      return harnessFailure(failed, started);
  }
}

/** `harness-start-failed` for the program the step's `harness.started` names, and how long the engine waited for it. */
function harnessFailure(failed: RunFailedEvent, started: FailedStart): StartFailure | undefined {
  if (started.harness === undefined) {
    return undefined;
  }
  return {
    reason: "harness-start-failed",
    agent: started.agent,
    harness: started.harness.id,
    withinMs: started.harness.timeoutMs,
    ...(failed.harnessCause === undefined ? {} : { cause: failed.harnessCause }),
  };
}
