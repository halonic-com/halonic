import { type ErrorKind, KindedError } from "@halonicjs/std";
import { isTrustRefusal, type TauriShell, type TrustRefusalKind } from "./shell.ts";

/**
 * The shell's commands for the folders the person picked, which the shell remembers in the
 * profile across restarts (HAL-6637). Only a pick in the folder dialog adds to that list; these
 * commands can only open an entry again or drop one.
 */
export const pickedFolderCommands = {
  /**
   * `{ location }` → nothing. Opens a folder the person picked before, as a pick does, only while
   * it is still that folder; otherwise refused as `not_picked`, `folder_missing`, `folder_changed`
   * or `folder_unreadable`, and the entry stays.
   */
  reopen: "reopen_folder",
  /**
   * `{ location }` → nothing; also when the folder isn't remembered. Drops the entry and closes the
   * folder opened for it. Its trust record stays.
   */
  forget: "forget_folder",
} as const;

/**
 * The folders the person picked, opened again after a restart and forgotten through the shell, as
 * the Studio's Recent rows need (`fs-tauri.picked-folders`). The page names a location the shell
 * remembered from a pick; it can't make the shell open any other folder.
 *
 * @example
 * const picked = new TauriPickedFolders(ipc);
 * await picked.reopen("/work/acme"); // opened, or a `not_found` or `denied` KindedError
 * await picked.forget("/work/acme"); // as Remove from Recent
 */
export class TauriPickedFolders {
  readonly #shell: TauriShell;

  constructor(shell: TauriShell) {
    this.#shell = shell;
  }

  /**
   * Opens the folder at `location` again. Rejects with a `not_found` error when the folder is gone,
   * so a Recent row can say so and offer to remove it, and with a `denied` error when the shell
   * won't open it: never picked, forgotten, or no longer the folder that was picked.
   */
  async reopen(location: string): Promise<void> {
    await this.#call(pickedFolderCommands.reopen, location);
  }

  /** Forgets the folder at `location` and closes it, as Remove from Recent does. */
  async forget(location: string): Promise<void> {
    await this.#call(pickedFolderCommands.forget, location);
  }

  async #call(command: string, location: string): Promise<void> {
    try {
      await this.#shell.invoke(command, { location });
    } catch (reason) {
      throw pickedFolderFailure(reason);
    }
  }
}

/** How a surface should respond to each refusal of a picked-folder command. */
const errorKinds: Readonly<Record<TrustRefusalKind, ErrorKind>> = {
  not_picked: "denied",
  folder_missing: "not_found",
  folder_changed: "denied",
  // Something else is at the path, or it can't be read.
  folder_unreadable: "denied",
  io: "unavailable",
  // The trust records' refusals; these commands don't send them.
  unreadable: "internal",
  declined: "denied",
  busy: "conflict",
  invalid_record: "internal",
};

/**
 * The error a rejected picked-folder command becomes. A refusal keeps the shell's message, which
 * names no secret; anything else (a missing capability, a broken IPC call) is `unavailable`, and
 * its text is dropped.
 */
function pickedFolderFailure(reason: unknown): KindedError {
  if (!isTrustRefusal(reason)) {
    return new KindedError("unavailable", "The desktop shell gave no answer about the folder.");
  }
  return new KindedError(errorKinds[reason.kind], `The shell refused: ${reason.message}`);
}
