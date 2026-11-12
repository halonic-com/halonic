import { KindedError } from "@halonicjs/std";
import type { TauriShell } from "./shell.ts";

/**
 * The shell's command for finding programs (HAL-7876).
 */
export const commandPathCommands = {
  /**
   * `{ commands }` → an object of the absolute path of each command found, by the command as
   * written. The shell searches as the CLI does: the first program of that name in an absolute
   * folder of the PATH its login shell gives (the app's own where that can't be read), with
   * `PATHEXT`'s endings on Windows. A command it doesn't find is left out.
   */
  find: "command_paths",
} as const;

/**
 * Where each connector's program is on this computer, found by the desktop shell, because the
 * page can't read the PATH. The trust check fingerprints the path with the command, so the Studio
 * and the CLI must find the same one (`fs-tauri.command-paths`).
 *
 * @example
 * const paths = await new TauriCommandPaths(ipc).find(["npx", "uvx"]);
 * paths.get("npx"); // "/usr/local/bin/npx"
 */
export class TauriCommandPaths {
  readonly #shell: TauriShell;

  /** @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__` */
  constructor(shell: TauriShell) {
    this.#shell = shell;
  }

  /**
   * The path of each of `commands` the shell found; a command it didn't find is not in the map.
   *
   * @throws KindedError `unavailable` when the shell can't answer, such as a page without the
   *   `desktop-trust` capability; the shell's own text is not repeated
   */
  async find(commands: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (commands.length === 0) {
      return new Map();
    }
    let answer: unknown;
    try {
      answer = await this.#shell.invoke(commandPathCommands.find, { commands: [...commands] });
    } catch {
      throw noAnswer();
    }
    if (typeof answer !== "object" || answer === null || Array.isArray(answer)) {
      throw noAnswer();
    }
    const found = new Map<string, string>();
    for (const [command, path] of Object.entries(answer)) {
      // Only what was asked for, and only a path: the page never takes more than it named.
      if (!commands.includes(command)) {
        continue;
      }
      if (typeof path !== "string") {
        throw noAnswer();
      }
      found.set(command, path);
    }
    return found;
  }
}

function noAnswer(): KindedError {
  return new KindedError("unavailable", "The desktop shell gave no answer about the programs.");
}
