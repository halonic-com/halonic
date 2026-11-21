/**
 * Why a connector couldn't start, when it's one the engine can name
 * (requirement `ports.connector-start-failure`): its program isn't on this
 * computer, a secret it needs isn't set, or the plugin it comes from isn't
 * trusted yet or changed since the person trusted it. `program` and
 * `secret` are names as the connector's file writes them, never a secret's
 * value; `plugin` is the plugin's id.
 */
export type ConnectorStartFailure =
  | { readonly reason: "program-missing"; readonly program: string }
  | { readonly reason: "secret-not-set"; readonly secret: string }
  | { readonly reason: "plugin-not-trusted" | "plugin-changed"; readonly plugin: string };

/** How many errors deep, through `cause`, the reader looks for one it knows. */
const maxCauseDepth = 8;

/**
 * Why `value`, thrown while a connector started, says it couldn't start, or
 * `undefined` for any other error. A connector says it with one of these
 * errors, here or in the `cause` of the error it threw:
 *
 * - an `Error` named `ProgramNotFoundError` with the program's name in
 *   `program` (as `@halonicjs/adapter-mcp` throws it);
 * - an `Error` named `SecretNotSetError` with the secret's name in `secretName`
 *   (as `@halonicjs/adapter-mcp` throws it);
 * - an `Error` named `PluginConnectorNotTrustedError` with the plugin's id in
 *   `plugin` and `not-trusted` or `changed` in `reason` (as a plugin's
 *   connector in `@halonicjs/app` throws it).
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
  let error = value;
  for (let depth = 0; depth < maxCauseDepth && error instanceof Error; depth += 1) {
    const failure = knownFailureOf(error);
    if (failure !== undefined) return failure;
    error = error.cause;
  }
  return undefined;
}

/** The failure `error` itself says, without looking at its `cause`. */
function knownFailureOf(error: Error): ConnectorStartFailure | undefined {
  const { program, secretName, plugin, reason } = error as {
    program?: unknown;
    secretName?: unknown;
    plugin?: unknown;
    reason?: unknown;
  };
  if (error.name === "ProgramNotFoundError" && isName(program)) {
    return { reason: "program-missing", program };
  }
  if (error.name === "SecretNotSetError" && isName(secretName)) {
    return { reason: "secret-not-set", secret: secretName };
  }
  if (error.name === "PluginConnectorNotTrustedError" && isName(plugin)) {
    if (reason === "not-trusted") return { reason: "plugin-not-trusted", plugin };
    if (reason === "changed") return { reason: "plugin-changed", plugin };
  }
  return undefined;
}

function isName(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}
