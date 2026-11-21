import { findSecretShape } from "@halonicjs/std";

/** What the log says when the launcher's error gives nothing it can show. */
const noReason = "Halonic can't tell why";

/**
 * The engine's own error for an agent a person set to run on this computer,
 * without a sandbox, whose launcher didn't open. `runFailureReasonOf` turns
 * it into the run failure `this-computer-start-failed`, and its message, the
 * launcher's own reason, becomes the `error` of `run.failed`, so the command
 * line and Studio can say what failed without naming a sandbox (requirement
 * `engine.this-computer-start-failed`). Only the engine throws it.
 *
 * @example
 * throw new ThisComputerStartFailedError(launcherReasonOf(error), { cause: error });
 */
export class ThisComputerStartFailedError extends Error {
  override readonly name = "ThisComputerStartFailedError";

  /**
   * @param reason - the launcher's reason, from {@link launcherReasonOf}
   * @param options - `cause` keeps the launcher's error, for the log
   */
  constructor(reason: string, options?: { cause?: unknown }) {
    super(reason, options);
  }
}

/**
 * The launcher's reason, safe to log and to show: the first line of its
 * error's message, as the launcher wrote it. A message that is empty, isn't
 * an `Error`'s, or holds anything shaped like a key gives a fixed text
 * instead, so no value from the environment reaches the log.
 *
 * @example
 * launcherReasonOf(new Error("the bridge must be a loopback address, not 10.0.0.2"));
 * // "the bridge must be a loopback address, not 10.0.0.2"
 */
export function launcherReasonOf(error: unknown): string {
  if (!(error instanceof Error)) return noReason;
  const firstLine = error.message.split("\n", 1)[0]?.trim() ?? "";
  if (firstLine === "" || findSecretShape(firstLine) !== undefined) return noReason;
  return firstLine;
}
