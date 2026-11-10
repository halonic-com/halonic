import type { ProgramProbeResult } from "@halonicjs/ports";

/**
 * Whether `claude auth status` says no one is signed in. It prints its
 * answer as JSON and exits with 1 when no one is signed in (CLI reference,
 * fact check on HAL-2387). Only that answer counts: any other answer, such
 * as a version without the command or output Halonic can't read, is not
 * taken as signed out, because `detect()` never guesses.
 *
 * The output can name the person's account, so it is read here and never
 * passed on.
 */
export function saysSignedOut(answer: ProgramProbeResult): boolean {
  if (answer.status !== "ran" || answer.code !== 1) return false;
  return readLoggedIn(answer.stdout) === false;
}

/** The `loggedIn` field of `claude auth status`'s JSON, or `undefined` when there is none. */
function readLoggedIn(output: string): boolean | undefined {
  let status: unknown;
  try {
    status = JSON.parse(output);
  } catch {
    return undefined;
  }
  if (typeof status !== "object" || status === null || !("loggedIn" in status)) return undefined;
  return typeof status.loggedIn === "boolean" ? status.loggedIn : undefined;
}

/**
 * Why Claude Code can't call the model: no one is signed in, or the sign-in
 * stored on this computer has expired at Anthropic.
 */
export type SignInProblem = "signed-out" | "sign-in-expired";

/**
 * What Claude Code prints when a model request fails for want of a sign-in
 * (its errors page). An expired sign-in still looks signed in to
 * `claude auth status`, so the first request is where it shows.
 */
const signInMessages: readonly { start: string; problem: SignInProblem }[] = [
  { start: "Login expired", problem: "sign-in-expired" },
  { start: "Not logged in", problem: "signed-out" },
  { start: "Authentication required", problem: "signed-out" },
];

/**
 * Finds Claude Code's sign-in message in a line it printed, such as
 * "Login expired · Please run /login". A hint only: the wording can change
 * between releases, so a line it doesn't recognise is `undefined`, and the
 * run fails the general way.
 *
 * @example
 * findSignInProblem("Login expired · Please run /login"); // "sign-in-expired"
 */
export function findSignInProblem(line: string): SignInProblem | undefined {
  const text = line.trim();
  return signInMessages.find(({ start }) => text.startsWith(start))?.problem;
}

/** What a person reads for each problem, with the one thing to do. */
const signInSentences: Readonly<Record<SignInProblem, string>> = {
  "signed-out": "Claude Code isn't signed in on this computer. Sign in with `claude auth login`.",
  "sign-in-expired": "Claude Code's sign-in has expired. Sign in again with `claude auth login`.",
};

/**
 * The error a Claude Code run ends with when its program couldn't call the
 * model because of its sign-in. It ends the run before the agent's first
 * event, so the engine reports the run as `harness-start-failed` (harness
 * state H7, with the signed-out detail where Studio shows one).
 */
export class SignInError extends Error {
  readonly problem: SignInProblem;

  constructor(problem: SignInProblem) {
    super(signInSentences[problem]);
    this.name = "SignInError";
    this.problem = problem;
  }
}
