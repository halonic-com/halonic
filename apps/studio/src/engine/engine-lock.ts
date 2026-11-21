// The page's hold on the workspace's engine lock (HAL-8792): one engine at a time, the page's,
// the CLI's or another window's, runs a workspace's store. An open engine keeps its hold, so the
// Studio knows whether the lock is still its own when it ends the runs a removed trust stopped
// (HAL-13678).

import type { TauriHeldEngineLock } from "@halonicjs/adapter-fs-tauri";
import { KindedError } from "@halonicjs/std";
import { ErrorWithDetails } from "@halonicjs/studio-shell";

/** The workspace's engine lock, as the shell holds it for the page (`TauriEngineLock`). */
export interface PageEngineLock {
  /**
   * Holds the lock until it is released; `onLost` hears once if another process takes it over.
   *
   * @throws KindedError `conflict` whose `cause` is the shell's refusal, with the other process's `pid`
   */
  hold(onLost: (error: Error) => void): Promise<TauriHeldEngineLock>;
}

/** The lock as an open engine holds it. */
export interface EngineLockHold {
  readonly held: TauriHeldEngineLock;
  /** Whether another process took the lock over, so this page no longer holds it. */
  readonly lost: boolean;
  /** Set when the engine's close leaves the lock for its closer to give back. */
  kept: boolean;
}

/**
 * Takes the lock of the workspace called `name`; `onLost` hears once if another process later
 * takes it over.
 *
 * @throws KindedError `conflict` naming the workspace and the other process, `unavailable` when the
 *   lock can't be written, or the lock's other refusals
 */
export async function holdEngineLock(
  lock: PageEngineLock,
  name: string,
  onLost: (error: Error) => void,
): Promise<EngineLockHold> {
  let lost = false;
  try {
    const held = await lock.hold((error) => {
      lost = true;
      onLost(error);
    });
    return {
      held,
      kept: false,
      get lost() {
        return lost;
      },
    };
  } catch (refusal) {
    throw lockRefusal(refusal, name);
  }
}

/** The approved words for a lock the shell can't hold for this window (UX check S4, microcopy 22 F1 and F13). */
const lockWords = {
  cantWrite: "Halonic can't write to its data folder.",
  unexplained: "The engine lock was refused.",
} as const;

/**
 * The lock's refusal as the page says it. A `conflict` names the workspace and the other process,
 * which can be a terminal's `halonic serve` or another window (HAL-13758). A lock the shell can't
 * write says so in Halonic's words, and a folder that isn't open in this window is a failure
 * Halonic can't explain; both keep the shell's words for **Copy details** (UX check S4, HAL-12390).
 * Others stay as they are.
 */
function lockRefusal(refusal: unknown, name: string): unknown {
  if (!(refusal instanceof KindedError)) return refusal;
  const shellKind = shellKindOf(refusal.cause);
  if (refusal.kind === "conflict") {
    const pid = pidOf(refusal.cause);
    const holder = pid === undefined ? "" : ` (process ${pid})`;
    return new KindedError(
      "conflict",
      `${name} is already running in another Halonic on this computer${holder}.`,
      { fix: "Stop that one, then try again.", cause: refusal },
    );
  }
  if (shellKind === "io") {
    return new ErrorWithDetails("unavailable", lockWords.cantWrite, refusal.message, {
      cause: refusal,
    });
  }
  if (shellKind === "folder_not_open") {
    return new ErrorWithDetails("internal", lockWords.unexplained, refusal.message, {
      cause: refusal,
    });
  }
  return refusal;
}

/** The kind of the shell's own refusal (`conflict`, `io` or `folder_not_open`, see `engine_lock.rs`). */
function shellKindOf(refusal: unknown): string | undefined {
  if (typeof refusal !== "object" || refusal === null) return undefined;
  const { kind } = refusal as Record<string, unknown>;
  return typeof kind === "string" ? kind : undefined;
}

function pidOf(refusal: unknown): number | undefined {
  if (typeof refusal !== "object" || refusal === null) return undefined;
  const { pid } = refusal as Record<string, unknown>;
  return typeof pid === "number" ? pid : undefined;
}
