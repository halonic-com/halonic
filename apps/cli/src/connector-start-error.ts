// Why a connector's program didn't start, as a line the CLI can show
// (HAL-13670): `tools review | approve` start a connector to list its
// tools, and a missing program or secret is the user's to fix, not "a
// problem Halonic can't explain yet".

import { ProgramNotFoundError, SecretNotSetError } from "@halonicjs/adapter-mcp";
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
      connectorStartMessages.cantListProgramMissing(connector, program),
      connectorStartMessages.cantListProgramMissingFix(connector, file),
      { reason: "program-missing", program: error.program },
    );
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
