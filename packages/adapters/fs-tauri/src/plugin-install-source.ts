import { KindedError } from "@halonicjs/std";
import { noAnswer } from "./command-folder-reader.ts";
import { pluginInstallCommands } from "./plugin-install-commands.ts";
import { pluginInstallFailure } from "./plugin-install-failure.ts";
import { TauriPluginSourceReader } from "./plugin-source-reader.ts";
import type { TauriShell } from "./shell.ts";

/** One commit of a git repository, exported by the shell and ready to read. */
export interface ExportedPluginSource {
  /** Reads the commit's files, for core's `PluginService.add`. */
  readonly reader: TauriPluginSourceReader;
  /** The full id of the commit that was exported. */
  readonly commit: string;
  /** The remote's default branch, when no reference was named and the remote says which it is. */
  readonly branch: string | null;
  /** Removes the exported folder. Safe to call more than once, and it stops an export that still runs. */
  end(): Promise<void>;
}

/**
 * Where a plugin to add comes from in the Studio desktop app: a folder the
 * person picks, or one commit of a git repository the shell exports
 * (`fs-tauri.plugin-install`). Neither copies anything by itself. The
 * answer is a place core reads through {@link TauriPluginSourceReader},
 * checks and hashes, and the exact bytes it read are then placed with
 * `TauriPluginFolderWriter.place`, so what is trusted is what was checked.
 * The page never names a path, and the shell runs nothing from the source.
 *
 * @example
 * const location = await source.pick();
 * const exported = await source.exportGit("https://example.com/acme/weather", undefined, signal);
 * try {
 *   await service.add(exported.reader, { from, replace: false });
 * } finally {
 *   await exported.end();
 * }
 */
export class TauriPluginInstallSource {
  readonly #shell: TauriShell;
  readonly #newToken: () => string;

  /**
   * @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__`
   * @param newToken - makes the name an export is stopped by; a random one by default
   */
  constructor(shell: TauriShell, newToken: () => string = () => crypto.randomUUID()) {
    this.#shell = shell;
    this.#newToken = newToken;
  }

  /** **Choose folder…**: the computer's folder picker. The location of the folder, or `undefined` when the person picks nothing. */
  async pick(): Promise<string | undefined> {
    let answer: unknown;
    try {
      answer = await this.#shell.invoke(pluginInstallCommands.pick);
    } catch (reason) {
      throw pluginInstallFailure(reason);
    }
    if (answer === null) return undefined;
    if (typeof answer !== "string") throw noAnswer();
    return answer;
  }

  /** A reader of the folder at `location`, which `pick` answered. */
  reader(location: string): TauriPluginSourceReader {
    return new TauriPluginSourceReader(this.#shell, location);
  }

  /**
   * Exports one commit of the repository at `address` into a place the shell
   * keeps, the remote's default branch when `reference` is `undefined`.
   * When `signal` aborts, the shell stops git and removes everything, and
   * this rejects with a `conflict` error.
   *
   * @throws a `KindedError` for an address or reference the shell refuses (`invalid_input`), a repository that is too large (`invalid_input`), an export that was stopped (`conflict`), or a failure of git (`unavailable`)
   */
  async exportGit(
    address: string,
    reference: string | undefined,
    signal: AbortSignal,
  ): Promise<ExportedPluginSource> {
    signal.throwIfAborted();
    const token = this.#newToken();
    let ended: Promise<void> | undefined;
    const end = () => {
      ended ??= this.#end(token);
      return ended;
    };
    const stop = () => void end();
    signal.addEventListener("abort", stop, { once: true });
    let answer: unknown;
    try {
      answer = await this.#shell.invoke(pluginInstallCommands.gitExport, {
        address,
        reference: reference ?? null,
        token,
      });
    } catch (reason) {
      signal.removeEventListener("abort", stop);
      throw pluginInstallFailure(reason);
    }
    const exported = exportedOf(answer);
    // An abort that came before the shell knew the export is ended again
    // now that it does: the first end found nothing.
    if (exported === undefined) {
      await this.#end(token);
      throw noAnswer();
    }
    if (signal.aborted) {
      await this.#end(token);
      throw new KindedError("conflict", "Adding the plugin was stopped.");
    }
    return {
      reader: this.reader(exported.location),
      commit: exported.commit,
      branch: exported.branch,
      end: async () => {
        signal.removeEventListener("abort", stop);
        await end();
      },
    };
  }

  /** Ends the export; it never rejects, as the shell's call never refuses. */
  async #end(token: string): Promise<void> {
    try {
      await this.#shell.invoke(pluginInstallCommands.gitExportEnd, { token });
    } catch {
      // The shell answers nothing and refuses nothing; a page without the
      // capability never started an export, so there is nothing to end.
    }
  }
}

/** The shell's answer to an export, when it has the shape the shell gives. */
function exportedOf(
  answer: unknown,
): { location: string; commit: string; branch: string | null } | undefined {
  if (typeof answer !== "object" || answer === null) return undefined;
  const { location, commit, branch } = answer as Record<string, unknown>;
  if (typeof location !== "string" || typeof commit !== "string") return undefined;
  if (branch !== null && typeof branch !== "string") return undefined;
  return { location, commit, branch };
}
