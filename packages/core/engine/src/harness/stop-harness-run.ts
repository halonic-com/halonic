// Stops a harness run at the end of its call, and ends its event stream, so
// nothing the program started outlives the call.

import type { Harness, HarnessEvent, HarnessRun } from "@halonicjs/ports";

/**
 * Stops the harness run and ends its event stream. The stream ends even when
 * `cancel()` rejects, so a harness written as a generator still runs its own
 * clean-up. A program that couldn't be stopped may still be running, so that
 * failure is what the step reports, in place of its own result or error;
 * `original` stays as its `cause`.
 *
 * @param original - the error the step was ending with, if it was ending with one
 * @throws Error when the run couldn't be stopped
 */
export async function stopRun(
  harness: Harness,
  run: HarnessRun,
  events: AsyncIterator<HarnessEvent>,
  original: { error: unknown } | undefined,
): Promise<void> {
  let stopFailure: { error: unknown } | undefined;
  try {
    await run.cancel();
  } catch (error) {
    stopFailure = { error };
  }
  // Only after `cancel()`: the port then ends the stream, so a read
  // still waiting settles and `return()` doesn't wait behind it. A
  // harness written as a generator runs its own clean-up here.
  await events.return?.();
  if (stopFailure === undefined) return;
  const reason =
    stopFailure.error instanceof Error ? stopFailure.error.message : String(stopFailure.error);
  throw new Error(`${harness.name} couldn't be stopped, so it may still be running: ${reason}`, {
    cause: original === undefined ? stopFailure.error : original.error,
  });
}
