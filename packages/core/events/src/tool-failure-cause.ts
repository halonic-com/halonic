import type { ConnectorStartReason, ToolFailureCause, ToolNotMadeReason } from "./run-basics.ts";
import type { RunEventBody } from "./run-event.ts";

/** A `tool.result` event, whose `cause` this reads. */
type ToolResultEvent = Extract<RunEventBody, { type: "tool.result" }>;

/** The longest `name` a `connector-not-started` cause carries; the engine cuts a longer one. */
export const maxCauseNameLength = 120;

const notMadeReasons: readonly unknown[] = [
  "not-connected",
  "tool-gone",
  "sending-off",
  "bad-arguments",
] satisfies ToolNotMadeReason[];

const startReasons: readonly unknown[] = [
  "program-missing",
  "secret-not-set",
  "other",
] satisfies ConnectorStartReason[];

/** The fields a logged cause may have, each still unread. */
type CauseFields = Partial<Record<"code" | "seconds" | "why" | "name", unknown>>;

/**
 * Reads the `cause` of a stored `tool.result` event (requirement
 * `events.tool-result-cause`). It never throws: a cause with a code it
 * doesn't know, a field of the wrong type or a missing field reads as
 * absent, so a screen falls back to its plain line instead of showing part
 * of a cause. It copies only the cause's own fields, so an extra field in a
 * log never reaches a screen.
 *
 * @param event - the `tool.result` event, as parsed from the log
 * @returns the cause, or `undefined` when there is none it can read
 *
 * @example
 * toolFailureCauseOf(result); // cause { code: "time-limit", seconds: 60 } => { code: "time-limit", seconds: 60 }
 * toolFailureCauseOf(result); // cause { code: "melted" } => undefined
 */
export function toolFailureCauseOf(event: ToolResultEvent): ToolFailureCause | undefined {
  // Typed, but parsed from a file: it may hold anything.
  const cause: unknown = event.cause;
  if (typeof cause !== "object" || cause === null) return undefined;
  const fields: CauseFields = cause;
  switch (fields.code) {
    case "time-limit":
      return isSeconds(fields.seconds)
        ? { code: "time-limit", seconds: fields.seconds }
        : undefined;
    case "engine-stopped":
      return { code: "engine-stopped" };
    case "not-made":
      return notMadeReasons.includes(fields.why)
        ? { code: "not-made", why: fields.why as ToolNotMadeReason }
        : undefined;
    case "connector-not-started":
      return connectorNotStarted(fields);
    default:
      return undefined;
  }
}

/** A time limit in seconds: a finite number above zero. */
function isSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function connectorNotStarted(fields: CauseFields): ToolFailureCause | undefined {
  if (!startReasons.includes(fields.why)) return undefined;
  const why = fields.why as ConnectorStartReason;
  const { name } = fields;
  if (name === undefined) return { code: "connector-not-started", why };
  if (typeof name !== "string" || name === "" || name.length > maxCauseNameLength) return undefined;
  return { code: "connector-not-started", why, name };
}
