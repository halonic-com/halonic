// Telling the run about a request's failure, for the Node bridge and the
// Worker alike. Web-standard APIs only.

import type { HarnessBridgeOptions } from "@halonicjs/ports";
import { errorKindOf, KindedError } from "@halonicjs/std";

/**
 * Tells the run about a failure the program was only told "the run log has the
 * details" for, so that sentence is true. A failure the bridge named (a
 * {@link KindedError} other than `internal`) is already in the reply.
 */
export function reportUnnamedFailure(run: HarnessBridgeOptions, secret: string, error: unknown) {
  if (error instanceof KindedError && errorKindOf(error) !== "internal") return;
  reportFailure(run, secret, error);
}

/** Tells the run about a failure through its `reportError` hook, without the run token or credential, `secret`. */
export function reportFailure(run: HarnessBridgeOptions, secret: string, error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  try {
    run.reportError?.({
      kind: errorKindOf(error),
      message: text.replaceAll(secret, "[run token]"),
    });
  } catch {
    // The hook is told not to throw; if it does, the failure it was told of is all the bridge can lose.
  }
}
