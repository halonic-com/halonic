// Why a connector's program didn't start, as a line the CLI can show
// (HAL-13670): `tools review | approve` start a connector to list its
// tools, and a missing program or secret is the user's to fix, not "a
// problem Halonic can't explain yet". Nor is a program that stops right
// after it starts (HAL-13731).

import {
  ProgramNotFoundError,
  ProgramStoppedAtStartError,
  SecretNotSetError,
} from "@halonicjs/adapter-mcp";
import { OwnLineError } from "./command.ts";
import { connectorStartMessages } from "./messages/connector-start.ts";
import { printable } from "./output/printable.ts";

/**
 * The line and the fix for `error`, read from its type alone, as Studio's
 * agent host does (`connectorFailureReasonOf`): never the error's own text,
 * which can hold paths. `--json` gets the cause and the name, in the shape
 * Studio's `connector_failed` answer has.
 *
 * - a missing program is `unavailable`: it can work once it is installed;
 * - a program that stopped right after it started is `unavailable` too:
 *   it can work once whatever stops it is fixed;
 * - a missing secret is `invalid_input`: the user sets it first.
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
      connectorStartMessages.programMissing(program),
      connectorStartMessages.programMissingFix(program, connector, file),
      { reason: "program-missing", program: error.program },
    );
  }
  if (error instanceof ProgramStoppedAtStartError) {
    const program = printable(error.program);
    return new OwnLineError(
      "unavailable",
      connectorStartMessages.programStopped(program),
      connectorStartMessages.programStoppedFix(connector, file),
      { reason: "program-stopped", program: error.program },
    );
  }
  if (error instanceof SecretNotSetError) {
    const secret = printable(error.secretName);
    return new OwnLineError(
      "invalid_input",
      connectorStartMessages.secretMissing(secret),
      connectorStartMessages.secretMissingFix(secret),
      { reason: "secret-missing", secret: error.secretName },
    );
  }
  return undefined;
}
