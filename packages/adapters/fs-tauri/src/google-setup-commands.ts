/**
 * The shell's Google setup command. It only reads: the setup records the CLI
 * keeps in the `google/setups` folder of the profile, which the shell finds
 * itself. It takes no argument, so the page names neither a folder nor a
 * collection, and it never reads the sealed client secrets or tokens kept
 * beside them in `google/tokens`.
 *
 * A refusal has the shape of {@link RecordRefusal}: `broken_log`,
 * `linked_log` or `io`.
 */
export const googleSetupCommands = {
  /** `{}` → `{ lines, file }`: the setup records' whole lines (`""` when none was saved), and the log's path, for messages. */
  read: "google_setup_read",
} as const;
