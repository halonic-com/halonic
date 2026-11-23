// What the CLI does with each error its engine handles itself: count it
// towards stopping the command, show it only with `--debug`, or, for a lost
// engine lock, stop the command at once (HAL-16337).

import { LockLostError } from "@halonicjs/adapter-fs-node";
import type { EngineErrorSource } from "@halonicjs/adapter-workspace-engine-node";
import { KindedError } from "@halonicjs/std";
import { type Phrase, plainText } from "./messages/phrase.ts";
import { runMessages } from "./messages/run.ts";
import { workspaceMessages } from "./messages/workspace.ts";
import { printable } from "./output/printable.ts";

/**
 * The engine's `reportError`: a failed step, wake-up, tick or lock renewal
 * goes to `stuck`, which counts it. A run's connectors that failed to close,
 * a leftover program copy that couldn't be swept, or what a harness run left that couldn't be cleaned up, goes to `debug`
 * instead: it is clean-up, nothing tries it again, and it must never stop the command,
 * however often it happens in a `routines watch` (Liam, HAL-7171). So does a
 * harness bridge failure the run log couldn't record: the program already got
 * its answer, and the run goes on. So does why the harness sandbox doesn't
 * sweep kept grants under the profile's host lock, in its own words: it
 * isn't a clean-up that failed (HAL-15428).
 *
 * A lost engine lock stops the command at once, with a `conflict` error
 * that says so: the engine has closed, so a `routines watch` or `serve`
 * that went on would start nothing and say nothing.
 *
 * @example
 * const reportError = engineErrorReporter(stuck, (line) => context.debug(line));
 */
export function engineErrorReporter(
  stuck: { report(error: unknown, source: EngineErrorSource): void; stop(error: unknown): void },
  debug: (line: Phrase) => void,
): (error: unknown, source: EngineErrorSource) => void {
  return (error, source) => {
    if (error instanceof LockLostError) {
      stuck.stop(engineLockLost(error));
      return;
    }
    if (source === "run-connectors" || source === "program-copies" || source === "harness-host") {
      debug(runMessages.cleanUpFailed(source, reasonOf(error)).phrase);
      return;
    }
    if (source === "host-lock") {
      debug(runMessages.hostLockNote(reasonOf(error)).phrase);
      return;
    }
    if (source === "harness-bridge") {
      const cause =
        error instanceof Error && error.cause !== undefined ? reasonOf(error.cause) : undefined;
      debug(runMessages.bridgeFailureUnrecorded(reasonOf(error), cause).phrase);
      return;
    }
    // A failed lock renewal counts as the scheduler's errors do: three in a row stop the command.
    stuck.report(error, source);
  };
}

/** The error a command ends with when its engine lost the workspace's engine lock. */
function engineLockLost(error: LockLostError): KindedError {
  return new KindedError("conflict", plainText(workspaceMessages.engineLockLost().phrase), {
    fix: plainText(workspaceMessages.engineLockLostFix().phrase),
    cause: error,
  });
}

/** A thrown value's message, safe to print on one line. */
function reasonOf(error: unknown): string {
  return printable(error instanceof Error ? error.message : String(error));
}
