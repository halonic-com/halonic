import type { HarnessStartCause } from "@halonicjs/events";
import { RunFailureError } from "@halonicjs/ports";

/**
 * What the engine learned about why a sandbox or harness program didn't
 * start: the `Sandbox` port's reason code, or the harness cause.
 */
export interface StartFailedWhy {
  /** `SandboxCheck.reason`, when the sandbox check no longer passes. */
  readonly sandboxReason?: string;
  /** Why the harness program didn't start, when `Harness.detect()` says. */
  readonly harnessCause?: HarnessStartCause;
}

/**
 * The engine's own {@link RunFailureError} for a sandbox or harness program
 * that didn't start, with what the engine could tell about why.
 * `runFailureReasonOf` puts `sandboxReason` or `harnessCause` on `run.failed`
 * (requirements `engine.run-harness-failures`). Only the engine throws it: an
 * adapter can't, because the code would then come from outside the check.
 *
 * @example
 * throw new StartFailedError("harness-start-failed", "Claude Code didn't start.", { harnessCause: "signed-out" }, { cause });
 */
export class StartFailedError extends RunFailureError {
  readonly sandboxReason: string | undefined;
  readonly harnessCause: HarnessStartCause | undefined;

  /**
   * @param failure - `sandbox-start-failed` or `harness-start-failed`
   * @param message - safe to show and to log
   * @param why - what the engine knows about the cause
   * @param options - `cause` keeps the error this one wraps, for the log
   */
  constructor(
    failure: "sandbox-start-failed" | "harness-start-failed",
    message: string,
    why: StartFailedWhy,
    options?: { cause?: unknown },
  ) {
    super(failure, message, options);
    this.sandboxReason = why.sandboxReason;
    this.harnessCause = why.harnessCause;
  }
}
