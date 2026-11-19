import { type ErrorKind, KindedError } from "@halonicjs/std";
import {
  type EngineLockRefusalKind,
  engineLockCommands,
  isEngineLockRefusal,
} from "./engine-lock-commands.ts";
import type { TauriChannelHandle, TauriFileShell } from "./file-commands.ts";

/** A lock the shell holds for this page until {@link TauriHeldEngineLock.release}; `HeldLock` in `fs-node` is the same shape. */
export interface TauriHeldEngineLock {
  /** Gives the lock back and stops listening for its loss. Safe to call twice. */
  release(): Promise<void>;
}

/**
 * The workspace's one engine lock, held by the shell for the Studio's page
 * (HAL-8792): the same `engine.lock` the CLI's `openLocalEngine` holds, so
 * a second engine on the workspace is refused as `conflict`. The shell, not
 * the page, holds the lock and renews it. A reloaded page asks again and
 * keeps its lock.
 *
 * The page must stop its engine when the shell loses the lock (the computer
 * slept and the CLI took over): {@link TauriEngineLock.hold} calls `onLost`
 * then, as `holdLock` does, so the host closes the engine on it as
 * `openLocalEngine` does.
 */
export class TauriEngineLock {
  readonly #shell: TauriFileShell;
  readonly #workspace: string;

  /**
   * @param shell - the shell's IPC with a way to open channels, built from `window.__TAURI_INTERNALS__`
   * @param workspace - the workspace folder exactly as the person opened it in the shell: a subfolder has another `engine.lock`
   */
  constructor(shell: TauriFileShell, workspace: string) {
    this.#shell = shell;
    this.#workspace = workspace;
  }

  /**
   * Holds the lock until it is released.
   *
   * @param onLost - called once, if another process takes the lock over; the engine must stop
   * @throws KindedError `conflict` when another engine holds the lock (its `cause` is the shell's refusal, with the other process's `pid` when known), `denied` for a workspace that isn't open, `unavailable` otherwise
   */
  async hold(onLost: (error: Error) => void): Promise<TauriHeldEngineLock> {
    let channel: TauriChannelHandle | undefined;
    const close = () => channel?.close();
    channel = this.#shell.openChannel((message) => {
      close();
      onLost(lostError(message));
    });
    try {
      await this.#shell.invoke(engineLockCommands.hold, {
        workspace: this.#workspace,
        onLost: channel.argument,
      });
    } catch (reason) {
      close();
      throw refusalError(reason);
    }
    let released = false;
    return {
      release: async () => {
        if (released) {
          return;
        }
        released = true;
        close();
        try {
          await this.#shell.invoke(engineLockCommands.release, { workspace: this.#workspace });
        } catch (reason) {
          throw refusalError(reason);
        }
      },
    };
  }
}

const errorKinds: Readonly<Record<EngineLockRefusalKind, ErrorKind>> = {
  conflict: "conflict",
  folder_not_open: "denied",
  io: "unavailable",
};

function refusalError(reason: unknown): KindedError {
  if (!isEngineLockRefusal(reason)) {
    // A missing capability or a broken IPC call: the adapter can't vouch for its text.
    return new KindedError(
      "unavailable",
      "The desktop shell gave no answer to the engine lock call.",
    );
  }
  // The refusal is the cause, so a caller can name the other engine's `pid`.
  return new KindedError(errorKinds[reason.kind], reason.message, { cause: reason });
}

function lostError(message: unknown): Error {
  const text = (message as { message?: unknown } | null)?.message;
  return new Error(typeof text === "string" ? text : "The engine lock was lost.");
}
