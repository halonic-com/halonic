/**
 * The engine's own error for a step that didn't start because the sandbox
 * check failed. `runFailureReasonOf` turns it into the run failure
 * `sandbox-not-ready`, with the check's reason code, so Studio and the
 * command line word the refusal from the code (requirement
 * `engine.run-failure-reason-of`). Only the engine throws it: an adapter
 * can't, because the code would then come from outside the check.
 *
 * @example
 * throw new SandboxNotReadyError("bubblewrap-missing", "writer");
 */
export class SandboxNotReadyError extends Error {
  override readonly name = "SandboxNotReadyError";
  /** The `Sandbox` port's reason code, such as `bubblewrap-missing`. */
  readonly sandboxReason: string;

  /**
   * @param sandboxReason - why the sandbox can't start, as `SandboxCheck.reason` gave it
   * @param agent - the id of the agent that didn't start
   */
  constructor(sandboxReason: string, agent: string) {
    super(
      `The sandbox can't start on this computer (${sandboxReason}), so agent "${agent}" didn't start. Halonic never runs it without one.`,
    );
    this.sandboxReason = sandboxReason;
  }
}
