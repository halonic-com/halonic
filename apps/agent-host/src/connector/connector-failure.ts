import { SandboxSessionEndedError } from "@halonicjs/adapter-connector-stdio-sandbox";
import {
  ConnectorStoppedError,
  McpError,
  McpStoppedError,
  ProgramNotFoundError,
  SecretNotSetError,
} from "@halonicjs/adapter-mcp";

/**
 * Why a connector failed, in terms Studio's page can word (UX check C2,
 * HAL-12410): the cause and the one name it needs, never the error's own
 * text, which can hold paths, the program's output or secret values.
 *
 * - `program-missing`: the program, or the `node` an npm runner needs, isn't on this computer;
 * - `secret-missing`: a secret the connector names isn't set;
 * - `secret-refused`: the server refused its secret (HTTP 401 or 403);
 * - `stopped`: the program ended, or didn't answer in time.
 */
export type ConnectorFailureReason =
  | { readonly reason: "program-missing"; readonly program: string }
  | { readonly reason: "secret-missing"; readonly secret: string }
  | { readonly reason: "secret-refused" }
  | { readonly reason: "stopped" };

/**
 * The reason for `error`, from its type alone, or `undefined` for any other
 * failure, which Studio words as one it can't explain.
 */
export function connectorFailureReasonOf(error: unknown): ConnectorFailureReason | undefined {
  if (error instanceof ProgramNotFoundError) {
    return { reason: "program-missing", program: error.program };
  }
  if (error instanceof SecretNotSetError) {
    return { reason: "secret-missing", secret: error.secretName };
  }
  if (isStopped(error)) return { reason: "stopped" };
  if (
    error instanceof McpError &&
    (error.code === "not-signed-in" || error.code === "not-allowed")
  ) {
    return { reason: "secret-refused" };
  }
  return undefined;
}

function isStopped(error: unknown): boolean {
  return (
    error instanceof McpStoppedError ||
    error instanceof ConnectorStoppedError ||
    error instanceof SandboxSessionEndedError
  );
}
