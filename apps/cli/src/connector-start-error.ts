// Why a connector's program didn't start, as a line the CLI can show
// (HAL-13670): `tools review | approve` start a connector to list its
// tools, and a missing program or secret is the user's to fix, not "a
// problem Halonic can't explain yet". Nor is a program that stops right
// after it starts (HAL-13731), which also shows what the program said
// (HAL-15620).

import {
  ProgramNotFoundError,
  ProgramStoppedAtStartError,
  SecretNotSetError,
} from "@halonicjs/adapter-mcp";
import { OwnLineError, type TerminalDetails } from "./command.ts";
import { connectorStartMessages } from "./messages/connector-start.ts";
import { phrase } from "./messages/phrase.ts";
import { printable } from "./output/printable.ts";

/** How many of a stopped program's last lines are shown (Sofia, HAL-15620). */
const shownLines = 3;
/** How many characters of one of them are shown; a longer line ends in "…". */
const shownLineLength = 200;

/**
 * The line and the fix for `error`, read from its type alone, as Studio's
 * agent host does (`connectorFailureReasonOf`): never the error's own text,
 * which can hold paths. `--json` gets the cause and the name, in the shape
 * Studio's `connector_failed` answer has.
 *
 * - a missing program is `unavailable`: it can work once it is installed;
 * - a program that stopped by itself right after it started is
 *   `unavailable` too: it can work once whatever stops it is fixed. It is
 *   an `McpStoppedError`, so it is read here, before
 *   `connectorReachError`'s general "stopped" line, which a program that
 *   doesn't answer in time keeps;
 * - a missing secret is `invalid_input`: the user sets it first.
 *
 * Under a stopped program's line, the terminal shows its last lines on
 * standard error, as {@link programSaid} picks them; `--json` doesn't.
 *
 * @param connector - the connector's id, made safe to print
 * @param file - the connector's path in the workspace, made safe to print,
 *   or `undefined` when it has none
 * @returns the error to throw instead, or `undefined` for any other failure
 */
export function connectorStartError(
  error: unknown,
  connector: string,
  file: string | undefined,
): OwnLineError | undefined {
  if (error instanceof ProgramNotFoundError) {
    const program = printable(error.program);
    return new OwnLineError(
      "unavailable",
      connectorStartMessages.cantListProgramMissing(connector, program),
      connectorStartMessages.cantListProgramMissingFix(connector, file),
      { reason: "program-missing", program: error.program },
    );
  }
  if (error instanceof ProgramStoppedAtStartError) {
    return programStoppedError(error, connector, file);
  }
  if (error instanceof SecretNotSetError) {
    const secret = printable(error.secretName);
    return new OwnLineError(
      "invalid_input",
      connectorStartMessages.cantListSecretMissing(connector, secret),
      connectorStartMessages.cantListSecretMissingFix(secret),
      { reason: "secret-missing", secret: error.secretName },
    );
  }
  return undefined;
}

function programStoppedError(
  error: ProgramStoppedAtStartError,
  connector: string,
  file: string | undefined,
): OwnLineError {
  const said = programSaid(error.errorOutput);
  const details: TerminalDetails | undefined =
    said.length === 0
      ? undefined
      : {
          lines: [
            connectorStartMessages.programSaid().phrase,
            ...said.map((line) => phrase`  ${line}`),
          ],
          fix: connectorStartMessages.cantListProgramStoppedSaidFix(connector, file),
        };
  return new OwnLineError(
    "unavailable",
    connectorStartMessages.cantListProgramStopped(connector, printable(error.program)),
    connectorStartMessages.cantListProgramStoppedFix(connector, file),
    { reason: "program-stopped", program: error.program },
    details,
  );
}

/**
 * The lines to show of what a program that stopped wrote to its standard
 * error: the last {@link shownLines} that aren't blank, oldest first, each
 * made safe for the terminal and cut at {@link shownLineLength} characters.
 * The adapter has cleaned them already (`errorOutput`), and they are never
 * cleaned again here. Cutting them only after that cleaning is what keeps it
 * whole: a line holding a key has already been replaced, so no cut here can
 * leave the start of a secret behind.
 */
function programSaid(errorOutput: readonly string[]): string[] {
  return errorOutput
    .map(printable)
    .filter((line) => line.trim() !== "")
    .slice(-shownLines)
    .map(shortened);
}

function shortened(line: string): string {
  const characters = Array.from(line);
  if (characters.length <= shownLineLength) return line;
  return `${characters.slice(0, shownLineLength).join("")}…`;
}
