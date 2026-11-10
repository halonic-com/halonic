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
   * `{ record }` → nothing. The shell saves the record only when the person
   * chose its folder in the shell: picked it in the folder dialog, or said
   * yes when the shell asked. It then adds the folder to the folders git and
   * the file commands may use.
   */
  grant: "trust_grant",
  /**
   * `{ location }` → nothing; also when there is no record. The shell also
   * takes the folder off the folders git and the file commands may use, so a
   * revoked folder is closed at once, not at the next start.
   */
  revoke: "trust_revoke",
} as const;

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
}

/** Whether a rejection is the shell's refusal shape, as opposed to an IPC or permission failure. */
export function isTrustRefusal(reason: unknown): reason is TrustRefusal {
  if (typeof reason !== "object" || reason === null) {
    return false;
  }
  const { kind, message, location, file } = reason as Record<string, unknown>;
  return (
    trustRefusalKinds.some((known) => known === kind) &&
    typeof message === "string" &&
    (location === undefined || typeof location === "string") &&
    (file === undefined || typeof file === "string")
  );
}
