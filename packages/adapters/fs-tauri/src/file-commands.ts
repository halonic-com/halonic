import type { TauriShell } from "./shell.ts";

/**
 * The shell's file commands for the workspace's definitions. Every call
 * takes `{ workspace }`, a folder the person opened in the shell, plus the
 * arguments below; the shell refuses any other folder. `path` and `dir` are
 * workspace paths: relative and `/`-separated.
 *
 * `list`, `read`, `write` and `remove` also take an optional `folder`, one of
 * {@link TauriFileFolder}s: `"review"` works in the workspace's review
 * folder in the profile instead of the workspace. The shell works that
 * folder out itself, so the page never names a path outside an opened folder.
 *
 * The page isn't trusted, so the shell checks every path itself with the
 * rules of `checkPublicWorkspacePath` in `@halonicjs/ports`, and never reads,
 * writes or removes through a symbolic link, junction or reparse point.
 */
export const fileCommands = {
  /**
   * `{ dir }` → every file under `dir` (`null` for the whole workspace),
   * recursively and sorted, relative to the workspace. A missing `dir` gives
   * `[]`. Private entries, links and temporary write files are left out.
   */
  list: "fs_list",
  /** `{ path }` → the file's text, or `null` when there is no file. */
  read: "fs_read",
  /**
   * `{ path, text, expected }` → `{ status: "written" }` or
   * `{ status: "changed-on-disk", current }`. Under a lock the shell holds
   * for each file, it compares the file with `expected` (`null` for none),
   * then writes a temporary file in the same folder, flushes it and renames
   * it over the file, so nothing can come between the check and the write.
   */
  write: "fs_write",
  /** `{ path }` → nothing; also when there is no file. */
  remove: "fs_remove",
  /**
   * `{ channel }` → `{ watchId }`. The channel sends
   * `{ type: "changed", paths }` batches of files that may have changed, and
   * one `{ type: "failed", message }` if the watch stops. A folder that goes
   * away sends each file that was in it.
   */
  watch: "fs_watch",
  /** `{ watchId }` → nothing. No message comes after it returns. */
  unwatch: "fs_unwatch",
} as const;

/**
 * Which folder of a workspace a file command works in: `"workspace"`, the
 * workspace's own files, or `"review"`, the assistant's changes to review,
 * which are kept in the profile and never in the workspace (HAL-3417), at
 * `reviewFolder()` of `workspaceFolders` in `@halonicjs/profile`.
 */
export type TauriFileFolder = "workspace" | "review";

/** Why the shell refused a file call: the `kind` of its error, which names no secret. */
export const fileRefusalKinds = [
  /** The workspace isn't a folder the person opened in the shell. */
  "folder_not_open",
  /** The path is absolute, has a `.`, `..` or empty segment, or a backslash or NUL. */
  "unsafe_path",
  /** The path has a private segment, or a link in any segment. */
  "private_path",
  /** A folder under the workspace can't be read; `path` names it. */
  "folder_unreadable",
  /** The file isn't UTF-8 text. */
  "not_text",
  /** Reading or writing the folder failed. */
  "io",
] as const;

/** One of {@link fileRefusalKinds}. */
export type FileRefusalKind = (typeof fileRefusalKinds)[number];

/** What a refused file command rejects with. */
export interface FileRefusal {
  readonly kind: FileRefusalKind;
  readonly message: string;
  /** The folder's workspace path, for `folder_unreadable`. */
  readonly path?: string;
}

/** Whether a rejection is the shell's file refusal shape, as opposed to an IPC or permission failure. */
export function isFileRefusal(reason: unknown): reason is FileRefusal {
  if (typeof reason !== "object" || reason === null) {
    return false;
  }
  const { kind, message, path } = reason as Record<string, unknown>;
  return (
    fileRefusalKinds.some((known) => known === kind) &&
    typeof message === "string" &&
    (path === undefined || typeof path === "string")
  );
}

/** An open Tauri channel, as the page passes it to a command. */
export interface TauriChannelHandle {
  /** The value the command's channel argument takes, such as `__CHANNEL__:7`. */
  readonly argument: string;
  /** Stops reading: the shell's later messages are dropped. Closing twice is fine. */
  close(): void;
}

/**
 * The shell's IPC, plus a way to open a channel for `fs_watch`. The Studio
 * builds it from `window.__TAURI_INTERNALS__` and its own `TauriChannel`
 * (`@halonicjs/studio-services`), so this package needs no Tauri library.
 */
export interface TauriFileShell extends TauriShell {
  /** Opens a channel whose messages, in the order the shell sent them, go to `onMessage`. */
  openChannel(onMessage: (message: unknown) => void): TauriChannelHandle;
}
