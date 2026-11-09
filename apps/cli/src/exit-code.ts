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

/**
 * Each exit code with the few words `halonic --help` lists it with, in code
 * order. The CLI never prints an exit code anywhere else.
 */
export const exitCodeMeanings: readonly { readonly code: ExitCode; readonly meaning: string }[] = [
  { code: exitCode.ok, meaning: "worked" },
  { code: exitCode.failed, meaning: "failed or found errors" },
  { code: exitCode.usage, meaning: "wrong usage or input" },
  { code: exitCode.notTrusted, meaning: "not trusted" },
  { code: exitCode.notFound, meaning: "not found" },
  { code: exitCode.conflict, meaning: "conflict" },
  { code: exitCode.unauthenticated, meaning: "signed out" },
  { code: exitCode.denied, meaning: "not allowed" },
  { code: exitCode.limitReached, meaning: "limit reached" },
  { code: exitCode.unavailable, meaning: "didn't answer or the sandbox can't start" },
];

/**
 * The last entry `halonic --help` lists: not a code the CLI returns, but the
 * one the shell reports when Ctrl C (130) or SIGTERM (143) stops it.
 */
export const stoppedMeaning = "130 or 143 stopped";
