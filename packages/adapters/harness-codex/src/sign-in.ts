import type { ProgramProbeResult } from "@halonicjs/ports";

/** The line `codex login status` prints when no one is signed in. */
const notLoggedIn = "Not logged in";

/**
 * Whether `codex login status` says no one is signed in. It exits with 1
 * and prints "Not logged in" on its error output then (checked with Codex
 * 0.166.0 and in its source, HAL-2608). It also exits with 1 when it can't
 * read its settings or its stored sign-in, but with another message, so
 * only the exit code and that exact line together count. Any other answer
 * is not taken as signed out, because `detect()` never guesses.
 *
 * The output can show part of an API key or name the sign-in method, so
 * it is read here and never passed on.
 */
export function saysSignedOut(answer: ProgramProbeResult): boolean {
  if (answer.status !== "ran" || answer.code !== 1) return false;
  return hasLine(answer.stderr, notLoggedIn) || hasLine(answer.stdout, notLoggedIn);
}

/** Whether one of the lines of `output`, without the spaces around it, is `line`. */
function hasLine(output: string, line: string): boolean {
  return output.split("\n").some((printed) => printed.trim() === line);
}
