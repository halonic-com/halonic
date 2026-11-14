import {
  checkWorkspacePath,
  type FolderEntriesOptions,
  type FolderEntry,
  type FolderReader,
} from "@halonicjs/ports";
import { decodeBase64url, type ErrorKind, KindedError } from "@halonicjs/std";
import { type FolderRefusalKind, isFolderRefusal } from "./folder-commands.ts";
import type { TauriShell } from "./shell.ts";

/** The command names a folder reader calls: the `folder_*` ones, or the `plugin_folder_*` ones. */
export interface FolderReaderCommands {
  readonly entries: string;
  readonly read: string;
  readonly location: string;
}

/** What a folder reader's commands are told besides their own arguments, and what the reader shows as its location. */
export interface FolderReaderPlace {
  /** Sent with every call: `{ workspace }` for an opened folder, nothing for the plugins folder. */
  readonly args: Record<string, unknown>;
  /** Where the folder is, for messages. */
  readonly location: string;
}

/**
 * The `FolderReader` shared by the workspace and the plugins folder: each
 * call goes to one of three shell commands, entries are checked for the
 * port's shape, and a refusal becomes the error the port asks for. Only the
 * command names and the folder the calls name differ.
 */
export class CommandFolderReader implements FolderReader {
  readonly location: string;
  readonly #shell: TauriShell;
  readonly #commands: FolderReaderCommands;
  readonly #placeArgs: Record<string, unknown>;

  /**
   * @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__`
   * @param commands - the shell commands this reader calls
   * @param place - the folder the calls name
   */
  constructor(shell: TauriShell, commands: FolderReaderCommands, place: FolderReaderPlace) {
    this.#shell = shell;
    this.#commands = commands;
    this.#placeArgs = place.args;
    this.location = place.location;
  }

  async entries(dir?: string, options: FolderEntriesOptions = {}): Promise<FolderEntry[]> {
    if (dir !== undefined) {
      checkWorkspacePath(dir);
    }
    const answer = await this.#call(this.#commands.entries, {
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
    const answer = await this.#call(this.#commands.read, { path });
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
    const answer = await this.#call(this.#commands.location, { path: path ?? null });
    if (answer !== null && typeof answer !== "string") {
      throw noAnswer();
    }
    return answer;
  }

  /** Runs one command on this reader's folder, turning a refusal into the error the port asks for. */
  async #call(command: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.#shell.invoke(command, { ...this.#placeArgs, ...args });
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
export function folderFailure(reason: unknown): Error {
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

/** The error for a shell answer that is missing or has the wrong shape. */
export function noAnswer(): KindedError {
  return new KindedError("unavailable", "The desktop shell gave no answer to the folder call.");
}
