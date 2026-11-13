/**
 * The shell's read-only folder commands, behind `TauriFolderReader`. Every
 * call takes `{ workspace }`, a folder the person opened in the shell, plus
 * the arguments below; the shell refuses any other folder, and never reaches
 * into the profile, as for the `fs_*` commands. `dir` and `path` are
 * workspace paths: relative and `/`-separated.
 *
 * Unlike the `fs_*` commands they hide no name: `.git`, `.env` and the like
 * are listed and read. They never follow a link or open a special file, and
 * they only read: there is no command that writes or removes.
 */
export const folderCommands = {
  /**
   * `{ dir, limit, recursive }` → every entry under `dir` (`null` for the
   * whole workspace) as `{ path, kind, size? }`, sorted by code unit. `kind`
   * is `file`, `folder`, `link` or `other`; only a file has a `size`. With a
   * `limit` it stops once more entries were found; `recursive: false` lists
   * only what is directly under `dir`. A `dir` that isn't a folder gives `[]`.
   */
  entries: "folder_entries",
  /** `{ path }` → the file's exact bytes as base64url, or `null` when there is no file. */
  read: "folder_read",
  /** `{ path }` → the entry's real location (`null` for the workspace itself), or `null` when there is none. */
  location: "folder_location",
} as const;

/** Why the shell refused a folder call: the `kind` of its error, which names no secret. */
export const folderRefusalKinds = [
  /** The workspace isn't a folder the person opened in the shell. */
  "folder_not_open",
  /** The path is absolute, has a `.`, `..` or empty segment, or a backslash or NUL. */
  "unsafe_path",
  /** The path is in the profile, which no workspace call reaches, or has a link in a segment. */
  "private_path",
  /** The file is a pipe, a socket or a device, which the shell never opens. */
  "special_path",
  /** A folder under the workspace can't be read; `path` names it. */
  "folder_unreadable",
  /** Reading the folder failed, or a name in it isn't a valid path. */
  "io",
] as const;

/** One of {@link folderRefusalKinds}. */
export type FolderRefusalKind = (typeof folderRefusalKinds)[number];

/** What a refused folder command rejects with. */
export interface FolderRefusal {
  readonly kind: FolderRefusalKind;
  readonly message: string;
  /** The folder's workspace path, for `folder_unreadable`. */
  readonly path?: string;
}

/** Whether a rejection is the shell's folder refusal shape, as opposed to an IPC or permission failure. */
export function isFolderRefusal(reason: unknown): reason is FolderRefusal {
  if (typeof reason !== "object" || reason === null) {
    return false;
  }
  const { kind, message, path } = reason as Record<string, unknown>;
  return (
    folderRefusalKinds.some((known) => known === kind) &&
    typeof message === "string" &&
    (path === undefined || typeof path === "string")
  );
}
