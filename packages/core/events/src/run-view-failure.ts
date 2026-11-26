import type { RunFailureCause, RunFailureReason } from "./run-basics.ts";
import type { RunViewFailure } from "./run-view.ts";

/** The failure reasons that mean a service didn't answer for now, so trying later may work. */
const unavailableReasons: ReadonlySet<RunFailureReason> = new Set([
  "model-unreachable",
  "model-timeout",
  "provider-busy",
  "harness-unavailable",
  "interrupted",
]);

/** The causes whose code names the connection that refused, as `<connection>.<what>`. */
const connectionKinds: ReadonlySet<RunFailureCause["kind"]> = new Set([
  "unauthenticated",
  "denied",
]);

/** A connection name the view may show: a plain id, never free text. */
const connectionName = /^[a-z0-9-]{1,40}$/;

/** A plan's stop code, such as `plan.runs`. */
const planStop = /^plan\.[a-z0-9-]{1,40}$/;

/**
 * The closed failure an end user sees for a run's `reason` and typed `cause` (requirement
 * `events.run-view`). It reads only those two typed fields, never the error's text, so a
 * provider's message, a path or a stack never reaches the view.
 */
export function runViewFailureOf(
  reason: RunFailureReason | null | undefined,
  cause: RunFailureCause | undefined,
): RunViewFailure {
  if (reason === "cancelled") return { cause: "stopped" };
  const code = cause?.code ?? "";
  if (planStop.test(code)) return { cause: "limit", limit: code };
  if (reason === "budget" || reason === "out-of-credit") return { cause: "limit", limit: "budget" };
  const connection = code.split(".")[0] ?? "";
  if (cause !== undefined && connectionKinds.has(cause.kind) && connectionName.test(connection)) {
    return { cause: "connection", connection };
  }
  if (cause?.kind === "unavailable") return { cause: "unavailable" };
  if (reason !== null && reason !== undefined && unavailableReasons.has(reason)) {
    return { cause: "unavailable" };
  }
  return { cause: "other" };
}
