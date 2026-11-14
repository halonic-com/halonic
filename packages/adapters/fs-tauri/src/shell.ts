/**
 * The part of Tauri's IPC this adapter needs. The shell puts `invoke` on the
 * app's own page (`window.__TAURI_INTERNALS__`), and the `desktop-trust`
 * capability lets that page call the four `trust_*` commands. Passed in, so
 * tests use a fake shell and the adapter needs no Tauri library.
 */
export interface TauriShell {
  invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
}

/**
 * The shell's trust commands. The shell keeps the records in the `trust`
 * folder of the profile, laid out as `FileTrustStore` in `fs-node` lays it
 * out, so the CLI and the desktop app read and write the same records.
 */
export const trustCommands = {
  /** `{ location }` → the record, or `null` when there is none. */
  get: "trust_get",
  /** `{}` → every record, sorted by location. */
  list: "trust_list",
  /**
   * `{ locations }` → an object of whether each folder is there now, by the location as asked.
   * Only a location with a trust record is answered; any other is left out.
   */
  foldersFound: "trust_folders_found",
  /**
   * `{ record }` → nothing. The shell saves the record only when the person
   * chose its folder in the shell: picked it in the folder dialog, or said
   * yes when the shell asked. It then adds the folder to the folders git and
   * the file commands may use.
   */
  grant: "trust_grant",
  /**
   * `{ location }` → nothing; also when there is no record. The shell also
   * takes a folder a grant opened off the folders git and the file commands
   * may use, so it is closed at once, not at the next start. A folder the
   * person picked stays open, so the open workspace keeps its file access; it
   * only stops sparing a question.
   */
  revoke: "trust_revoke",
} as const;

/**
 * The shell's commands for a folder `<parent>/<name>` that may already exist, for the New workspace
 * dialog (HAL-8859). `parent` and `name` are checked as `create_workspace_folder` checks them.
 */
export const workspaceFolderCommands = {
  /**
   * `{ parent, name }` → a {@link WorkspaceFolderProbe}. Reads names only, never a file's contents.
   * A link or a file at the path is refused as `exists`.
   */
  probe: "probe_workspace_folder",
  /**
   * `{ parent, name }` → the folder's location, or `null` when the person says no. The shell opens
   * the folder as a picked folder only after it asks them the trust question itself. Refused as
   * `folder_missing` when it isn't there, `busy` while another dialog shows and `folder_changed`
   * when it was swapped while the question showed. No trust record is written.
   */
  open: "open_workspace_folder",
} as const;

/** What `probe_workspace_folder` found: nothing there, an empty folder, other files, or a `workspace.yaml`. */
export type WorkspaceFolderProbe = "new" | "empty" | "files" | "workspace";

/** Why the shell refused a trust call: the `kind` of its error, which names no secret. */
export const trustRefusalKinds = [
  /** The record exists but can't be read; `location` names it when the shell can tell. */
  "unreadable",
  /** The person said no when the shell asked to trust the folder, so nothing was saved. */
  "declined",
  /**
   * The shell is already asking the person about another folder. It shows one
   * question at a time, so the page can't stack them; nothing was saved.
   */
  "busy",
  /** The location isn't a folder that exists, so it can't be opened. */
  "folder_unreadable",
  /** The record the page sent isn't a trust record. */
  "invalid_record",
  /** Reading or writing the profile failed. */
  "io",
  /** `reopen_folder`: the location isn't a folder the person picked, or they forgot it since. */
  "not_picked",
  /** `reopen_folder`: nothing is at the picked folder's path any more. */
  "folder_missing",
  /**
   * `reopen_folder`, `open_workspace_folder`: the folder's path now leads to another folder, through a link swapped
   * in, or the folder was deleted and made again.
   */
  "folder_changed",
  /** `create_workspace_folder`: the name can't be a folder's name; `reason` says why. */
  "name_invalid",
  /** `create_workspace_folder`: the parent isn't Documents or a folder the person chose. */
  "parent_not_chosen",
  /** `create_workspace_folder` and the commands of {@link workspaceFolderCommands}: the new folder would be the shell's own profile, or inside it. */
  "parent_private",
  /** `create_workspace_folder`: a folder of that name is already in the parent; it is never adopted. The probe and open commands send it for a link or a file at the path. */
  "exists",
] as const;

/** One of {@link trustRefusalKinds}. */
export type TrustRefusalKind = (typeof trustRefusalKinds)[number];

/** What a refused command rejects with. */
export interface TrustRefusal {
  readonly kind: TrustRefusalKind;
  readonly message: string;
  /** The record's location, for `unreadable`, when the shell can read it from the file. */
  readonly location?: string;
  /** The record's file, for `unreadable`, so a person can delete it by hand. */
  readonly file?: string;
  /** Why the shell refused a `name_invalid` name, as a stable word the page can turn into a sentence. */
  readonly reason?: string;
}

/** Whether a rejection is the shell's refusal shape, as opposed to an IPC or permission failure. */
export function isTrustRefusal(reason: unknown): reason is TrustRefusal {
  if (typeof reason !== "object" || reason === null) {
    return false;
  }
  const { kind, message, location, file, reason: why } = reason as Record<string, unknown>;
  return (
    trustRefusalKinds.some((known) => known === kind) &&
    typeof message === "string" &&
    (location === undefined || typeof location === "string") &&
    (file === undefined || typeof file === "string") &&
    (why === undefined || typeof why === "string")
  );
}
