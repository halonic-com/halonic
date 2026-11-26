// What went wrong with a local integration's last call, for the line on its
// connector's page (`app.connector-trouble`, HAL-18391 plan section 2.4). It
// is read from the local request log: the status of the call's last request
// and the failure note, never the service's reply. The log comes back as
// untrusted text, and a note's field names come from the integration's own
// code (Liam), so only a plain host and path characters are shown, and a long
// field name is cut.

import type { RequestLogLine } from "./integration-log/index.ts";

/** The troubles a connector's page names; any other failure shows no line. */
export type ConnectorTroubleKind =
  | "reply-changed"
  | "not-accepted"
  | "not-allowed"
  | "not-found"
  | "slow-down";

/** The kind of trouble for each status of the call's last request. */
const kindOfStatus: ReadonlyMap<unknown, ConnectorTroubleKind> = new Map([
  [401, "not-accepted"],
  [403, "not-allowed"],
  [404, "not-found"],
  [429, "slow-down"],
]);

/** A local integration's last call failed, and why. */
export interface ConnectorTrouble {
  readonly kind: ConnectorTroubleKind;
  /** The host the call's last request went to, or `""` when the log names no plain host. */
  readonly host: string;
  /** For `reply-changed`: the fields the integration's check named, cleaned for showing. */
  readonly fields: readonly string[];
}

/** The longest field name shown; a longer one is cut and ends in `…`. */
export const maxShownFieldLength = 60;
/** How many field names a trouble keeps, as the runner's failure note does. */
const maxFields = 8;
/** What a field name may hold to be shown: a path in the reply, such as `items[0].status`. */
const pathCharacters = /^[A-Za-z0-9_.[\]-]+$/;
/** What stands for a field name that isn't a plain path. */
export const hiddenField = "{…}";
/** A plain host name with an optional port, as the log stores one; anything else isn't shown. */
const plainHost = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*(?::[0-9]{1,5})?$/;
const maxHostLength = 260;

/**
 * The trouble of the integration's last call, from its request log, oldest first. There is one
 * only when the log ends with a failure note: a later call that worked, or one still running,
 * ends it with a request. A note with fields says the reply changed; otherwise the status of the
 * last request before the note says which trouble it is, and any other status is none.
 */
export function connectorTroubleOf(lines: readonly RequestLogLine[]): ConnectorTrouble | undefined {
  const last = lines.at(-1);
  if (last?.type !== "failure") return undefined;
  const request = lines.findLast((line) => line.type === "request");
  const host = request?.type === "request" ? shownHost(request.host) : "";
  if (Array.isArray(last.fields)) {
    const fields = last.fields.slice(0, maxFields).map(shownField);
    return { kind: "reply-changed", host, fields };
  }
  const kind = request?.type === "request" ? kindOfStatus.get(request.status) : undefined;
  return kind === undefined ? undefined : { kind, host, fields: [] };
}

/**
 * A field name as the page and the chat may show it: `{…}` when it holds anything but path
 * characters, such as markup, a space or a quote, and cut to {@link maxShownFieldLength}.
 */
export function shownField(field: unknown): string {
  if (typeof field !== "string" || !pathCharacters.test(field)) return hiddenField;
  return field.length <= maxShownFieldLength
    ? field
    : `${field.slice(0, maxShownFieldLength - 1)}…`;
}

function shownHost(host: unknown): string {
  return typeof host === "string" && host.length <= maxHostLength && plainHost.test(host)
    ? host
    : "";
}
