/**
 * What a `halonic` command tells the shell when it ends. Scripts and CI read
 * these, so they never change meaning. 0 to 3 are the CLI's own; 4 to 9 are
 * the error kinds from `@halonicjs/std` that have no code of their own here
 * (`internal` ends with `failed` and `invalid_input` with `usage`).
 */
export const exitCode = {
  /** Everything worked. */
  ok: 0,
  /** The command ran and found errors, or failed. Also the `internal` kind: a bug on our side. */
  failed: 1,
  /**
   * The command line was wrong: an unknown command or option, or a missing
   * argument. Also the `invalid_input` kind: a value or file the user gave is wrong.
   */
  usage: 2,
  /** The workspace isn't trusted on this machine, so the command refused to start anything. */
  notTrusted: 3,
  /** The `not_found` kind: the workflow, hub, run or other thing asked for doesn't exist. */
  notFound: 4,
  /** The `conflict` kind: it exists, but its state doesn't allow this now. */
  conflict: 5,
  /** The `unauthenticated` kind: a sign-in is missing or has expired. */
  unauthenticated: 6,
  /** The `denied` kind: a rule says no, such as a permission sheet or a refused approval. */
  denied: 7,
  /** The `limit_reached` kind: a rate limit, quota or spend budget is used up. */
  limitReached: 8,
  /** The `unavailable` kind: something Halonic depends on is down or timed out; a retry may work. */
  unavailable: 9,
} as const;

/** One of the {@link exitCode} values. */
export type ExitCode = (typeof exitCode)[keyof typeof exitCode];
