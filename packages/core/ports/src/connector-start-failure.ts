/**
 * Why a connector couldn't start, when it's one the engine can name
 * (requirement `ports.connector-start-failure`): its program isn't on this
 * computer or stopped by itself right after it started, a secret it needs
 * isn't set, the plugin it comes from isn't trusted yet, changed since the
 * person trusted it or its sandbox didn't work when it started, the sandbox
 * a plugin's backend runs in isn't ready here, or a local integration's
 * sandbox isn't available here and the person hasn't allowed it to run
 * without it. `program` and `secret` are names as the connector's file
 * writes them, never a secret's value; `plugin` is the plugin's id, and
 * `pluginName` its name as a person sees it; `sandbox` is why the sandbox
 * isn't available, as the start gate names it (`container`, `windows`, …).
 */
export type ConnectorStartFailure =
  | { readonly reason: "program-missing" | "program-stopped"; readonly program: string }
  | { readonly reason: "secret-not-set"; readonly secret: string }
  | { readonly reason: "plugin-not-trusted" | "plugin-changed"; readonly plugin: string }
  | { readonly reason: "plugin-stopped"; readonly pluginName: string }
  | { readonly reason: "sandbox-not-ready" }
  | { readonly reason: "unfenced-not-allowed"; readonly sandbox: string };

/** How many errors deep, through `cause`, the reader looks for one it knows. */
const maxCauseDepth = 8;

/**
 * Why `value`, thrown while a connector started, says it couldn't start, or
 * `undefined` for any other error. A connector says it with one of these
 * errors, here or in the `cause` of the error it threw:
 *
 * - an `Error` named `ProgramNotFoundError` with the program's name in
 *   `program` (as `@halonicjs/adapter-mcp` throws it);
 * - an `Error` named `ProgramStoppedAtStartError` with the program's name in
 *   `program` (as `@halonicjs/adapter-mcp` throws it);
 * - an `Error` named `SecretNotSetError` with the secret's name in `secretName`
 *   (as `@halonicjs/adapter-mcp` throws it);
 * - an `Error` named `PluginConnectorNotTrustedError` with the plugin's id in
 *   `plugin` and `not-trusted` or `changed` in `reason` (as a plugin's
 *   connector in `@halonicjs/app` throws it);
 * - an `Error` named `PluginBackendStoppedError` with the plugin's name in
 *   `pluginName` (as `@halonicjs/adapter-integration-runner` throws it when
 *   the sandbox didn't work when the plugin's backend started);
 * - an `Error` named `PluginBackendNotFencedError` (as
 *   `@halonicjs/adapter-integration-runner` throws it), whose `reason` stays
 *   out, as it is for a log only;
 * - an `Error` named `UnfencedStartNotAllowedError` with the gate's reason in
 *   `sandboxReason` (as the `halonic` command's local integration throws it).
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
  const { program, secretName, plugin, pluginName, reason, sandboxReason } = error as {
    program?: unknown;
    secretName?: unknown;
    plugin?: unknown;
    pluginName?: unknown;
    reason?: unknown;
    sandboxReason?: unknown;
  };
  if (error.name === "ProgramNotFoundError" && isName(program)) {
    return { reason: "program-missing", program };
  }
  if (error.name === "ProgramStoppedAtStartError" && isName(program)) {
    return { reason: "program-stopped", program };
  }
  if (error.name === "SecretNotSetError" && isName(secretName)) {
    return { reason: "secret-not-set", secret: secretName };
  }
  if (error.name === "PluginConnectorNotTrustedError" && isName(plugin)) {
    if (reason === "not-trusted") return { reason: "plugin-not-trusted", plugin };
    if (reason === "changed") return { reason: "plugin-changed", plugin };
  }
  if (error.name === "PluginBackendStoppedError" && isName(pluginName)) {
    return { reason: "plugin-stopped", pluginName };
  }
  if (error.name === "PluginBackendNotFencedError") return { reason: "sandbox-not-ready" };
  if (error.name === "UnfencedStartNotAllowedError" && isName(sandboxReason)) {
    return { reason: "unfenced-not-allowed", sandbox: sandboxReason };
  }
  return undefined;
}

function isName(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}
