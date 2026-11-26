import type {
  ConnectorStartReason,
  ServiceRefusal,
  ServiceRefusedReason,
  ToolFailureCause,
  ToolNotMadeReason,
} from "./run-basics.ts";
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
  "program-stopped",
  "secret-not-set",
  "plugin-not-trusted",
  "plugin-changed",
  "plugin-stopped",
  "sandbox-not-ready",
  "unfenced-not-allowed",
  "other",
] satisfies ConnectorStartReason[];

/** The most Halonic tries a request again after a 429: the kit's limit. */
export const maxServiceRetries = 2;

/** The longest `host` a `service-refused` cause carries: the longest a host name can be. */
export const maxCauseHostLength = 253;

/**
 * What a `service-refused` cause's `host` may hold: a host name in its
 * ASCII (`xn--`) form, an IPv4 address, or an IPv6 address in brackets.
 */
const hostPattern = /^[a-z0-9._-]+$|^\[[0-9a-f:.]+\]$/;

/** The fields a logged cause may have, each still unread. */
type CauseFields = Partial<
  Record<"code" | "seconds" | "why" | "name" | "retries" | "host" | "sentOnce", unknown>
>;

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
    case "service-refused":
      return serviceRefused(fields);
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

/** A `service-refused` cause, with `sentOnce` only when it is `true`. */
function serviceRefused(fields: CauseFields): ToolFailureCause | undefined {
  const refusal = serviceRefusalOf(fields);
  if (refusal === undefined) return undefined;
  return {
    code: "service-refused",
    ...refusal,
    ...(fields.sentOnce === true ? { sentOnce: true } : {}),
  };
}

function serviceRefusalOf(fields: CauseFields): ServiceRefusal | undefined {
  const why = fields.why as ServiceRefusedReason | undefined;
  switch (why) {
    case "not-accepted":
    case "not-allowed":
      return { why };
    case "slow-down":
      return isRetries(fields.retries) ? { why, retries: fields.retries } : undefined;
    case "host-not-declared":
      return isCauseHost(fields.host) ? { why, host: fields.host } : undefined;
    default:
      return undefined;
  }
}

/** How many times Halonic tried again: a whole number from 0 to {@link maxServiceRetries}. */
function isRetries(value: unknown): value is number {
  return (
    Number.isInteger(value) && (value as number) >= 0 && (value as number) <= maxServiceRetries
  );
}

function isCauseHost(value: unknown): value is string {
  return typeof value === "string" && value.length <= maxCauseHostLength && hostPattern.test(value);
}
