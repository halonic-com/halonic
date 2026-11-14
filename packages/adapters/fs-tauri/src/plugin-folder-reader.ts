import {
  checkWorkspacePath,
  type FolderEntriesOptions,
  type FolderEntry,
  type FolderReader,
} from "@halonicjs/ports";
import { decodeBase64url, type ErrorKind, KindedError } from "@halonicjs/std";
import { type FileRefusalKind, isFileRefusal } from "./file-commands.ts";
import { pluginFolderCommands } from "./plugin-folder-commands.ts";
import type { TauriShell } from "./shell.ts";

/**
 * Read access to the profile's plugins folder in the Studio desktop app
 * (port `FolderReader`), over the shell's `plugin_folder_*` commands. The
 * page names no folder: the shell reads the plugins folder of the CLI's
 * profile, never follows a link and never opens a special file. Paths are
 * checked here first, as the port says, and the shell checks them again.
 *
 * @example
 * const reader = new TauriPluginFolderReader(shell);
 * const manifest = await reader.read("acme-weather/plugin.yaml");
 */
export class TauriPluginFolderReader implements FolderReader {
  /** Where the plugins folder is, for messages; the shell owns the real path. */
  readonly location = "plugins";
  readonly #shell: TauriShell;

  /** @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__` */
  constructor(shell: TauriShell) {
    this.#shell = shell;
  }

  async entries(dir?: string, options: FolderEntriesOptions = {}): Promise<FolderEntry[]> {
    if (dir !== undefined) {
      checkWorkspacePath(dir);
    }
    const answer = await callPluginFolder(this.#shell, pluginFolderCommands.entries, {
      dir: dir ?? null,
      limit: options.limit ?? null,
      recursive: options.recursive ?? true,
    });
    if (!Array.isArray(answer) || !answer.every(isFolderEntry)) {
      throw noAnswer();
    }
    return answer;
  }

  async read(path: string): Promise<Uint8Array | null> {
    checkWorkspacePath(path);
    const answer = await callPluginFolder(this.#shell, pluginFolderCommands.read, { path });
    if (answer === null) {
      return null;
    }
    const bytes = typeof answer === "string" ? decodeBase64url(answer) : undefined;
    if (bytes === undefined) {
      throw noAnswer();
    }
    return bytes;
  }

  async locationOf(path?: string): Promise<string | null> {
    if (path !== undefined) {
      checkWorkspacePath(path);
    }
    const answer = await callPluginFolder(this.#shell, pluginFolderCommands.location, {
      path: path ?? null,
    });
    if (answer !== null && typeof answer !== "string") {
      throw noAnswer();
    }
    return answer;
  }
}

/** Whether the shell's entry is one the port describes: only a file has a size. */
function isFolderEntry(entry: unknown): entry is FolderEntry {
  if (typeof entry !== "object" || entry === null) {
    return false;
  }
  const { path, kind, size } = entry as Record<string, unknown>;
  if (typeof path !== "string") {
    return false;
  }
  if (kind === "file") {
    return typeof size === "number" && Number.isSafeInteger(size) && size >= 0;
  }
  return (kind === "folder" || kind === "link" || kind === "other") && size === undefined;
}

/** How a surface should respond to each refusal that isn't a path the port refuses. */
const errorKinds: Readonly<
  Record<Exclude<FileRefusalKind, "unsafe_path" | "private_path">, ErrorKind>
> = {
  // The plugins folder is the profile's own: nothing the person opened.
  folder_not_open: "internal",
  folder_unreadable: "unavailable",
  not_text: "internal",
  io: "unavailable",
};

/**
 * Runs one `plugin_folder_*` command, turning a refusal into the error the
 * ports ask for. A path the shell refuses is a `RangeError`; anything that
 * isn't the shell's refusal shape (a missing capability, a broken IPC call)
 * is `unavailable`, and its text is dropped: the adapter can't vouch for it.
 */
export async function callPluginFolder(
  shell: TauriShell,
  command: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  try {
    return await shell.invoke(command, args);
  } catch (reason) {
    throw pluginFolderFailure(reason);
  }
}

/** The shell's refusal for a special file, which the `plugin_folder_*` commands add to the file refusals. */
function isSpecialPath(reason: unknown): reason is { kind: "special_path"; message: string } {
  const { kind, message } = (reason ?? {}) as Record<string, unknown>;
  return kind === "special_path" && typeof message === "string";
}

function pluginFolderFailure(reason: unknown): Error {
  if (isSpecialPath(reason)) {
    return new RangeError(`The plugin path is refused: ${reason.message}`, { cause: reason });
  }
  if (!isFileRefusal(reason)) {
    return noAnswer();
  }
  if (reason.kind === "unsafe_path" || reason.kind === "private_path") {
    return new RangeError(`The plugin path is refused: ${reason.message}`, { cause: reason });
  }
  return new KindedError(
    errorKinds[reason.kind],
    `The plugins folder refused the call: ${reason.message}`,
  );
}

/** The error for a shell answer that is missing or has the wrong shape. */
export function noAnswer(): KindedError {
  return new KindedError(
    "unavailable",
    "The desktop shell gave no answer to the plugins folder call.",
  );
}
