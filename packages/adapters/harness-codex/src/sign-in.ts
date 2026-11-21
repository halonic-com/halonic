import type { ProgramProbeResult } from "@halonicjs/ports";

/** The line `codex login status` prints when no one is signed in. */
const notLoggedIn = "Not logged in";

/**
 * How the line starts and ends that `codex login status` prints when
 * `CODEX_HOME` names a folder that isn't there, such as an agent's settings
 * folder before its first sign-in (checked with Codex 0.169.0, HAL-15329):
 * `Error loading configuration: CODEX_HOME points to "<folder>", but that path does not exist`.
 */
const missingFolder = {
  start: "Error loading configuration: CODEX_HOME points to ",
  end: ", but that path does not exist",
};

/**
 * Whether `codex login status` says no one is signed in. It exits with 1
 * and prints "Not logged in" on its error output then (checked with Codex
 * 0.166.0 and in its source, HAL-2608). It also exits with 1 when
 * `CODEX_HOME` names a folder that isn't there: no sign-in can be stored in
 * a folder that doesn't exist, so that counts as signed out too
 * (HAL-15329). It exits with 1 as well when it can't read its settings or
 * its stored sign-in, but with other messages, so only the exit code and one
 * of those exact lines together count. Any other answer is not taken as
 * signed out, because `detect()` never guesses.
 *
 * The output can show part of an API key or name the sign-in method, so
 * it is read here and never passed on.
 */
export function saysSignedOut(answer: ProgramProbeResult): boolean {
  if (answer.status !== "ran" || answer.code !== 1) return false;
  const lines = [...linesOf(answer.stderr), ...linesOf(answer.stdout)];
  return lines.some((line) => line === notLoggedIn || namesMissingFolder(line));
}

/** Whether `line` is Codex's message about a `CODEX_HOME` folder that isn't there. */
function namesMissingFolder(line: string): boolean {
  return line.startsWith(missingFolder.start) && line.endsWith(missingFolder.end);
}

/** The lines of `output`, each without the spaces around it. */
function linesOf(output: string): string[] {
  return output.split("\n").map((printed) => printed.trim());
}
