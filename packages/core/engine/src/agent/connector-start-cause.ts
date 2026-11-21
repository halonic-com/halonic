import { maxCauseNameLength, type ToolFailureCause } from "@halonicjs/events";
import { type ConnectorStartFailure, connectorStartFailureOf } from "@halonicjs/ports";

/** The cause the run log gives a connector that didn't start. */
export type ConnectorNotStartedCause = Extract<ToolFailureCause, { code: "connector-not-started" }>;

/**
 * The cause for a connector that didn't start because of `error`
 * (requirements `engine.tool-result-cause` and
 * `engine.connector-listing-failed`): the program's or the secret's name, or
 * the plugin's id, when the error is one `connectorStartFailureOf` reads,
 * cut to `maxCauseNameLength`, else `other` with no name. Never any part of
 * the error's message, which can hold paths or a program's output.
 *
 * @example
 * connectorStartCause(new ProgramNotFoundError("npx")); // { code: "connector-not-started", why: "program-missing", name: "npx" }
 * connectorStartCause(new Error("socket closed")); // { code: "connector-not-started", why: "other" }
 */
export function connectorStartCause(error: unknown): ConnectorNotStartedCause {
  const failure = connectorStartFailureOf(error);
  if (failure === undefined) return { code: "connector-not-started", why: "other" };
  return {
    code: "connector-not-started",
    why: failure.reason,
    name: nameOf(failure).slice(0, maxCauseNameLength),
  };
}

/** The name a failure gives: the program's, the secret's or the plugin's. */
function nameOf(failure: ConnectorStartFailure): string {
  switch (failure.reason) {
    case "program-missing":
      return failure.program;
    case "secret-not-set":
      return failure.secret;
    case "plugin-not-trusted":
    case "plugin-changed":
      return failure.plugin;
  }
}
