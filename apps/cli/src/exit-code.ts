/**
 * What a `halonic` command tells the shell when it ends. Scripts and CI read
 * these, so they never change meaning.
 */
export const exitCode = {
  /** Everything worked. */
  ok: 0,
  /** The command ran and found errors, or failed. */
  failed: 1,
  /** The command line was wrong: an unknown command or option, or a missing argument. */
  usage: 2,
  /** The workspace isn't trusted on this machine, so the command refused to start anything. */
  notTrusted: 3,
} as const;

/** One of the {@link exitCode} values. */
export type ExitCode = (typeof exitCode)[keyof typeof exitCode];
