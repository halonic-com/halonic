import { maxCauseNameLength, type ToolFailureCause } from "@halonicjs/events";
import { connectorStartFailureOf } from "@halonicjs/ports";

/** The cause the run log gives a connector that didn't start. */
export type ConnectorNotStartedCause = Extract<ToolFailureCause, { code: "connector-not-started" }>;

/**
 * The cause for a connector that didn't start because of `error`
 * (requirements `engine.tool-result-cause` and
 * `engine.connector-listing-failed`): the program or the secret's name when
 * the error is one `connectorStartFailureOf` reads, cut to
 * `maxCauseNameLength`, else `other` with no name. Never any part of the
 * error's message, which can hold paths or a program's output.
 *
 * @example
 * connectorStartCause(new ProgramNotFoundError("npx")); // { code: "connector-not-started", why: "program-missing", name: "npx" }
 * connectorStartCause(new Error("socket closed")); // { code: "connector-not-started", why: "other" }
 */
export function connectorStartCause(error: unknown): ConnectorNotStartedCause {
  const failure = connectorStartFailureOf(error);
  if (failure === undefined) return { code: "connector-not-started", why: "other" };
  const name = failure.reason === "program-missing" ? failure.program : failure.secret;
  return {
    code: "connector-not-started",
    why: failure.reason,
    name: name.slice(0, maxCauseNameLength),
  };
}
