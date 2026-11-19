/**
 * The shell's engine lock commands. The shell holds `engine.lock` in the
 * workspace's folder in the profile, the file the CLI's engine holds with
 * `holdLock` in `fs-node`, in the same format and with the same stale
 * takeover, so the CLI and the Studio never both run an engine on one
 * workspace. The page names the workspace, a folder the person opened in the
 * shell, and never a path.
 *
 * Both calls take `{ workspace }`. The lock belongs to the shell and the
 * window that asked, not to the page: it lives as long as the app, so a page
 * that reloads and asks again finds its own lock.
 */
export const engineLockCommands = {
  /**
   * `{ workspace, onLost }` → nothing. Holds the lock for the calling window
   * and renews it. `onLost` is a channel that gets one {@link EngineLockLost}
   * if another process takes the lock over; asking again from the same window
   * hands the shell its new channel.
   */
  hold: "engine_lock_hold",
  /** `{ workspace }` → nothing; also when the window doesn't hold the lock. */
  release: "engine_lock_release",
} as const;

/** Why the shell refused an engine lock call: the `kind` of its error, which names no secret. */
export const engineLockRefusalKinds = [
  /** Another engine, in another process or another window, holds the lock; `pid` is its process when known. */
  "conflict",
  /** The workspace isn't a folder the person opened in the shell. */
  "folder_not_open",
  /** Reading or writing the lock file or its folder failed. */
  "io",
] as const;

/** One of {@link engineLockRefusalKinds}. */
export type EngineLockRefusalKind = (typeof engineLockRefusalKinds)[number];

/** What a refused engine lock command rejects with. */
export interface EngineLockRefusal {
  readonly kind: EngineLockRefusalKind;
  readonly message: string;
  /** The other engine's process, for `conflict`, when its record is known. */
  readonly pid?: number;
}

/** What the shell sends on the `onLost` channel: the lock is gone, so the engine must stop. */
export interface EngineLockLost {
  readonly message: string;
}

/** Whether a rejection is the shell's engine lock refusal shape, as opposed to an IPC or permission failure. */
export function isEngineLockRefusal(reason: unknown): reason is EngineLockRefusal {
  if (typeof reason !== "object" || reason === null) {
    return false;
  }
  const { kind, message, pid } = reason as Record<string, unknown>;
  return (
    engineLockRefusalKinds.some((known) => known === kind) &&
    typeof message === "string" &&
    (pid === undefined || typeof pid === "number")
  );
}
