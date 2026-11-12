import {
  checkWorkspacePath,
  type FolderEntriesOptions,
  type FolderEntry,
  type FolderReader,
} from "@halonicjs/ports";
import { decodeBase64url, type ErrorKind, KindedError } from "@halonicjs/std";
import { type FolderRefusalKind, folderCommands, isFolderRefusal } from "./folder-commands.ts";
import type { TauriShell } from "./shell.ts";

/**
 * Read access to every byte of a folder the person opened in the Studio
 * desktop app, with nothing left out (port `FolderReader`): every call goes
 * to one of the shell's `folder_*` commands, which list entries with their
 * kind, give a file's exact bytes and give an entry's real location. Links
 * are listed and never followed, and special files never opened.
 *
 * The page names the workspace, never a path outside it. Paths are checked
 * here as the port says, before the shell is called, and the shell checks
 * them again, since the page isn't trusted; it also refuses any path through
 * a link, which only it can see, and the profile.
 *
 * @example
 * const reader = new TauriFolderReader(shell, workspace);
 * const bytes = await reader.read("acme-notes/plugin.yaml");
 */
export class TauriFolderReader implements FolderReader {
  /** The folder, as the person opened it in the shell. */
  readonly location: string;
  readonly #shell: TauriShell;

  /**
   * @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__`
   * @param workspace - the folder, as the person opened it in the shell
   */
  constructor(shell: TauriShell, workspace: string) {
    this.#shell = shell;
    this.location = workspace;
  }

  async entries(dir?: string, options: FolderEntriesOptions = {}): Promise<FolderEntry[]> {
    if (dir !== undefined) {
      checkWorkspacePath(dir);
    }
    const answer = await this.#call(folderCommands.entries, {
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
    const answer = await this.#call(folderCommands.read, { path });
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
    const answer = await this.#call(folderCommands.location, { path: path ?? null });
    if (answer !== null && typeof answer !== "string") {
      throw noAnswer();
    }
    return answer;
  }

  /** Runs one command on this reader's folder, turning a refusal into the error the port asks for. */
  async #call(command: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.#shell.invoke(command, { workspace: this.location, ...args });
    } catch (reason) {
      throw folderFailure(reason);
    }
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
  Record<Exclude<FolderRefusalKind, "unsafe_path" | "private_path" | "special_path">, ErrorKind>
> = {
  folder_not_open: "denied",
  folder_unreadable: "unavailable",
  io: "unavailable",
};

/**
 * The error a rejected `folder_*` command becomes. A path the shell refuses
 * is a `RangeError`, as the port asks: the page checks the same rules first,
 * so this is a link or the profile in the path, or a special file, which only
 * the shell can see. Anything that isn't the shell's refusal shape (a missing
 * capability, a broken IPC call) is `unavailable`, and its text is dropped:
 * the adapter can't vouch for it.
 */
function folderFailure(reason: unknown): Error {
  if (!isFolderRefusal(reason)) {
    return noAnswer();
  }
  switch (reason.kind) {
    case "unsafe_path":
    case "private_path":
    case "special_path":
      return new RangeError(`The folder path is refused: ${reason.message}`, { cause: reason });
    default:
      return new KindedError(
        errorKinds[reason.kind],
        `The folder reader refused the call: ${reason.message}`,
      );
  }
}

function noAnswer(): KindedError {
  return new KindedError("unavailable", "The desktop shell gave no answer to the folder call.");
}
