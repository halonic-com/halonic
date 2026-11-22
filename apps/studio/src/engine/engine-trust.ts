// How the page's engine keeps to the workspace's trust (`studio.untrusted-starts-nothing`): it
// refuses a start from a workspace that may start nothing, it says the shell's refusal of a folder
// Remove trust closed as that same refusal (HAL-15695), and it ends the runs an engine it closed
// for a removed trust stopped (HAL-13678).

import { TauriRunStore } from "@halonicjs/adapter-fs-tauri";
import { type AssembledEngine, endStoppedRuns } from "@halonicjs/engine";
import { isFolderNotOpen, isUntrustedRefusal, WorkspaceUntrusted } from "@halonicjs/studio-shell";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { EngineLockHold } from "./engine-lock.ts";
import type { EngineServiceOptions } from "./engine-service-options.ts";

/**
 * The typed cause of a run the engine stopped because the workspace's trust was removed; the run
 * page's banner says so by this code (`runs.run-view.trust-removed`).
 */
export const trustRemovedCause = { kind: "denied", code: "workspace.trust-removed" } as const;

/** The refusal of a start from a workspace that may start nothing; a page offers **Review** for it. */
function untrustedRefusal(): WorkspaceUntrusted {
  return new WorkspaceUntrusted("This workspace isn't trusted yet, so nothing was started.");
}

/**
 * Refuses, failing closed, a workspace that isn't trusted and reaches more than the test model.
 *
 * @throws WorkspaceUntrusted `denied`, with the code that tells it from other `denied` errors
 */
export async function refuseUntrusted(
  mayStart: EngineServiceOptions["mayStart"],
  workspace: LoadedWorkspace,
): Promise<void> {
  if (!(await mayStart(workspace).catch(() => false))) throw untrustedRefusal();
}

/**
 * Runs `start`, and says the shell's refusal of a folder that isn't open ({@link isFolderNotOpen})
 * as the untrusted refusal when the workspace isn't trusted now. Remove trust closes a folder that a
 * trust grant opened, so a page still open on it gets that refusal from the shell before the
 * engine's own check, or in its place for a workspace that reaches only the test model. Trusting
 * again opens the folder again, so **Review** is the way back. A trusted workspace keeps the
 * shell's refusal, a failure Halonic can't explain. The refusal has no `cause`: the page would
 * read the shell's refusal under it as that failure.
 *
 * @param isTrustedNow the last trust check's answer, since the folder can't be read for a new one
 * @throws WorkspaceUntrusted for that refusal, or what `start` throws
 */
export async function untrustedWhenFolderClosed<T>(
  start: () => Promise<T>,
  isTrustedNow: () => boolean,
): Promise<T> {
  try {
    return await start();
  } catch (error) {
    if (!isUntrustedRefusal(error) && isClosedFolder(error) && !isTrustedNow()) {
      throw untrustedRefusal();
    }
    throw error;
  }
}

/**
 * Whether `error` is the shell's refusal of a folder that isn't open: as the Tauri stores give it,
 * or under the engine lock's failure Halonic can't explain, which keeps it as its cause
 * (`engine-lock.ts`).
 */
function isClosedFolder(error: unknown): boolean {
  return isFolderNotOpen(error) || isFolderNotOpen((error as { readonly cause?: unknown })?.cause);
}

/**
 * Closes `engine` and ends the runs it stopped, holding the workspace's lock until they are ended:
 * an engine that took the lock in between, the CLI's or another window's, could have started a run
 * this would end while it is going (`end-interrupted-runs.ts`). For the same reason it ends nothing
 * once another process took the lock over.
 */
export async function closeAndEndStoppedRuns(
  engine: AssembledEngine,
  lock: EngineLockHold,
  { ipc, location, clock }: Pick<EngineServiceOptions, "ipc" | "location" | "clock">,
): Promise<void> {
  lock.kept = true;
  try {
    await engine.close();
    if (lock.lost) return;
    await endStoppedRuns(new TauriRunStore(ipc, location), clock, trustRemovedCause);
  } finally {
    await lock.held.release();
  }
}
