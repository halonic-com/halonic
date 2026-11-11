/**
 * The shell's record commands. Every call names the record folder by the
 * workspace, a folder the person opened in the shell; the shell works out
 * `<profile>/workspaces/<key>/records` itself, as `recordsFolder` in
 * `@halonicjs/profile` does, and keeps each collection's log as
 * `FileRecordStore` in `fs-node` keeps it: named by the SHA-256 of the
 * collection, one JSON change per line. The page never names a path.
 *
 * Every call takes `{ workspace }`, plus the arguments below. Every write
 * holds the store's `write.lock`, which the CLI takes too.
 */
export const recordCommands = {
  /**
   * `{ appends: [{ collection, lines }] }` → nothing. Appends each
   * collection's lines, whole lines of JSON changes to it, and flushes
   * them; when one fails, every log already added to is cut back, so the
   * call stores all of them or none.
   */
  append: "record_append",
  /**
   * `{ collection }` → `{ lines, version, file }`: the log's whole lines
   * (`""` when there is none), their version to replace them by, and the
   * log's path, for messages.
   */
  read: "record_read",
  /**
   * `{ collection, version, lines }` → `{ status: "replaced" }` or
   * `{ status: "changed" }`. Replaces the log with `lines` (removes it when
   * they are `""`) through a flushed temporary file and a rename, but only
   * while its whole lines still have `version`; otherwise writes nothing.
   */
  replace: "record_replace",
} as const;

/** Why the shell refused a record call: the `kind` of its error, which names no secret. */
export const recordRefusalKinds = [
  /** The workspace isn't a folder the person opened in the shell. */
  "folder_not_open",
  /**
   * The lines to write aren't whole lines of JSON changes to the
   * collection. The page writes them, so this is a bug.
   */
  "invalid_lines",
  /** The log's whole lines aren't UTF-8 text; the message names the log. */
  "broken_log",
  /**
   * The log is a link, a hard link or not a plain file. The store never
   * reads or writes through one; the message names the log.
   */
  "linked_log",
  /** Reading or writing the record folder, or taking the write lock, failed. */
  "io",
] as const;

/** One of {@link recordRefusalKinds}. */
export type RecordRefusalKind = (typeof recordRefusalKinds)[number];

/** What a refused record command rejects with. */
export interface RecordRefusal {
  readonly kind: RecordRefusalKind;
  readonly message: string;
}

/** Whether a rejection is the shell's record refusal shape, as opposed to an IPC or permission failure. */
export function isRecordRefusal(reason: unknown): reason is RecordRefusal {
  if (typeof reason !== "object" || reason === null) {
    return false;
  }
  const { kind, message } = reason as Record<string, unknown>;
  return recordRefusalKinds.some((known) => known === kind) && typeof message === "string";
}
