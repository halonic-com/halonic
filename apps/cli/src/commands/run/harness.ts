// `halonic run --harness <harness>`: the harness every agent of the run runs
// in, in place of the one its file names (HAL-189 6b, Liam on HAL-3789). It
// is checked before the engine opens, so a harness that doesn't exist or
// can't start here runs nothing and writes nothing to the run log. The
// engine refuses an id that isn't a harness as well, for its other callers.

import { AGENT_HARNESSES } from "@halonicjs/format";
import { type ErrorKind, KindedError } from "@halonicjs/std";
import type { HarnessProgram } from "../../harness-programs.ts";
import type { Message } from "../../messages/define.ts";
import { plainText } from "../../messages/phrase.ts";
import { runMessages } from "../../messages/run.ts";
import { printable } from "../../output/printable.ts";

/**
 * `--harness` names no harness (`invalid_input`, exit 2), or one whose
 * program can't start on this computer (`unavailable`, exit 9). Its message
 * is the reason after "Couldn't run support-reply:", and its fix says what
 * to do about that reason.
 */
export class RunHarnessError extends KindedError {
  constructor(kind: ErrorKind, reason: Message, fix: Message) {
    super(kind, plainText(reason.phrase), { fix: plainText(fix.phrase) });
  }
}

/**
 * The harness `--harness` names, once its program is found on this
 * computer: `undefined` without the option, and `halonic` as it is, because
 * Halonic's own loop starts no program. A program that is installed but
 * signed out is allowed: it can still run with a key Halonic holds.
 *
 * @param given - the option's value as typed
 * @param programs - every harness program Halonic can start, other than its own loop
 * @throws RunHarnessError `invalid_input` when `given` isn't a harness
 * @throws RunHarnessError `unavailable` when the program isn't installed, is
 *   too old, or couldn't be asked its version
 *
 * @example
 * await runHarnessOf("codex", nodeHarnessPrograms()); // "codex", when Codex is installed
 * await runHarnessOf("claude", nodeHarnessPrograms()); // throws: there's no harness called claude
 */
export async function runHarnessOf(
  given: string | undefined,
  programs: readonly HarnessProgram[],
): Promise<string | undefined> {
  if (given === undefined || given === "halonic") return given;
  const program = AGENT_HARNESSES.includes(given)
    ? programs.find((each) => each.id === given)
    : undefined;
  if (program === undefined) {
    throw new RunHarnessError(
      "invalid_input",
      runMessages.noHarness(given),
      runMessages.noHarnessFix(AGENT_HARNESSES),
    );
  }
  const found = await program.detect();
  switch (found.status) {
    case "ready":
    case "signed-out":
      return given;
    case "missing":
      throw new RunHarnessError(
        "unavailable",
        runMessages.harnessMissing(program.name),
        runMessages.installHarness(program.name),
      );
    case "unsupported":
      throw new RunHarnessError(
        "unavailable",
        runMessages.harnessUnsupported(program.name, printable(found.version), found.supported),
        runMessages.updateHarness(program.name),
      );
    case "failed":
      throw new RunHarnessError(
        "unavailable",
        runMessages.harnessVersionFailed(program.name, printable(found.error)),
        runMessages.checkHarness(program.name),
      );
  }
}
