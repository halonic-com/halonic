import { maxCauseNameLength, type ToolFailureCause } from "@halonicjs/events";
import { type ConnectorStartFailure, connectorStartFailureOf } from "@halonicjs/ports";

/** The cause the run log gives a connector that didn't start. */
export type ConnectorNotStartedCause = Extract<ToolFailureCause, { code: "connector-not-started" }>;

/**
 * The cause for a connector that didn't start because of `error`
 * (requirements `engine.tool-result-cause` and
 * `engine.connector-listing-failed`): the program's or the secret's name, the
 * plugin's id, for a stopped plugin its name, or for a local integration
 * whose start without the sandbox was refused why there is no sandbox, when
 * the error is one `connectorStartFailureOf` reads, cut to
 * `maxCauseNameLength`; `sandbox-not-ready`, with no name, for a plugin's
 * backend with no sandbox to run in; else `other` with no name. Never any
 * part of the error's message, which can hold paths or a program's output.
 *
 * @example
 * connectorStartCause(new ProgramNotFoundError("npx")); // { code: "connector-not-started", why: "program-missing", name: "npx" }
 * connectorStartCause(new Error("socket closed")); // { code: "connector-not-started", why: "other" }
 */
export function connectorStartCause(error: unknown): ConnectorNotStartedCause {
  const failure = connectorStartFailureOf(error);
  if (failure === undefined) return { code: "connector-not-started", why: "other" };
  if (failure.reason === "sandbox-not-ready") {
    return { code: "connector-not-started", why: failure.reason };
  }
  return {
    code: "connector-not-started",
    why: failure.reason,
    name: nameOf(failure).slice(0, maxCauseNameLength),
  };
}

/**
 * The name a failure gives: the program's, the secret's, the plugin's id or
 * its name, or why there is no sandbox.
 */
function nameOf(failure: Exclude<ConnectorStartFailure, { reason: "sandbox-not-ready" }>): string {
  switch (failure.reason) {
    case "program-missing":
    case "program-stopped":
      return failure.program;
    case "secret-not-set":
      return failure.secret;
    case "plugin-not-trusted":
    case "plugin-changed":
      return failure.plugin;
    case "plugin-stopped":
      return failure.pluginName;
    case "unfenced-not-allowed":
      return failure.sandbox;
  }
}
