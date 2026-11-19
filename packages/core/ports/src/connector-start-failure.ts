/**
 * Why a connector couldn't start, when it's one the engine can name
 * (requirement `ports.connector-start-failure`): its program isn't on this
 * computer, or a secret it needs isn't set. `program` and `secret` are names
 * as the connector's file writes them, never a secret's value.
 */
export type ConnectorStartFailure =
  | { readonly reason: "program-missing"; readonly program: string }
  | { readonly reason: "secret-not-set"; readonly secret: string };

/**
 * Why `value`, thrown while a connector started, says it couldn't start, or
 * `undefined` for any other error. A connector adapter says it with two
 * errors (as `@halonicjs/adapter-mcp` does):
 *
 * - an `Error` named `ProgramNotFoundError` with the program's name in `program`;
 * - an `Error` named `SecretNotSetError` with the secret's name in `secretName`.
 *
 * It reads them by name and field, not `instanceof`, so the engine needs no
 * adapter, and an adapter with its own copy of this package works too. It
 * keeps only the name, never the error's message, which can hold paths or
 * a program's output.
 *
 * @example
 * connectorStartFailureOf(new SecretNotSetError("notes", "NOTES_TOKEN"));
 * // => { reason: "secret-not-set", secret: "NOTES_TOKEN" }
 */
export function connectorStartFailureOf(value: unknown): ConnectorStartFailure | undefined {
  if (!(value instanceof Error)) return undefined;
  const { program, secretName } = value as { program?: unknown; secretName?: unknown };
  if (value.name === "ProgramNotFoundError" && isName(program)) {
    return { reason: "program-missing", program };
  }
  if (value.name === "SecretNotSetError" && isName(secretName)) {
    return { reason: "secret-not-set", secret: secretName };
  }
  return undefined;
}

function isName(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}
