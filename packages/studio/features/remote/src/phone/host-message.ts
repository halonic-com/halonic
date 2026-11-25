/**
 * How the phone reads what the computer's remote gateway sends (tunnel D7,
 * design on HAL-15159, B7 item 10). Host text is data: the phone accepts only
 * the messages of the protocol version it speaks, each exactly as the
 * protocol lists it, and disconnects on anything else. It reads strictly in
 * the same way the host reads the phone (`parseGatewayClientMessage`): the
 * size first, before anything is parsed.
 */

import {
  type GatewayHostMessage,
  gatewayClosingErrorCodes,
  gatewayMaxIdLength,
  gatewayMaxMessageBytes,
  gatewayMessagingLists,
  gatewayProtocolVersion,
  gatewayRefusalCodes,
} from "@halonicjs/ports";

/**
 * Why a host message was refused. Each one ends the session.
 *
 * - `too-large`: more than `gatewayMaxMessageBytes` bytes of UTF-8;
 * - `malformed`: not one JSON object, a `type` the protocol doesn't list,
 *   or a missing, extra or wrongly typed field;
 * - `other-version`: a `welcome` from a host that speaks another version.
 */
export type HostMessageProblem = "too-large" | "malformed" | "other-version";

/** What {@link parseHostMessage} made of one message. */
export type HostMessageResult =
  | { readonly ok: true; readonly message: GatewayHostMessage }
  | { readonly ok: false; readonly problem: HostMessageProblem };

/** Whether one field's value is acceptable. */
type Check = (value: unknown) => boolean;

const idPattern = new RegExp(`^[A-Za-z0-9_-]{1,${gatewayMaxIdLength}}$`);
const isId: Check = (value) => typeof value === "string" && idPattern.test(value);
const isText: Check = (value) => typeof value === "string";
const isBoolean: Check = (value) => typeof value === "boolean";
const isWhole: Check = (value) => Number.isSafeInteger(value) && (value as number) >= 0;
const isPositive: Check = (value) => isWhole(value) && (value as number) >= 1;
const oneOf =
  (...allowed: readonly unknown[]): Check =>
  (value) =>
    allowed.includes(value);
const listOf =
  (item: Check): Check =>
  (value) =>
    Array.isArray(value) && value.every(item);

/**
 * An object with every field of `required`, any of `optional`, and nothing
 * else, each passing its check. `type`, when listed, is checked like the rest.
 */
function exactly(
  required: Readonly<Record<string, Check>>,
  optional: Readonly<Record<string, Check>> = {},
): Check {
  return (value) => {
    if (!isObject(value)) return false;
    const hasRequired = Object.keys(required).every((name) => Object.hasOwn(value, name));
    const allValid = Object.keys(value).every((name) => {
      const check = fieldCheck(name, required) ?? fieldCheck(name, optional);
      return check?.(value[name]) === true;
    });
    return hasRequired && allValid;
  };
}

/** The check for `name`, if `checks` lists it as its own field (never one every object inherits). */
function fieldCheck(name: string, checks: Readonly<Record<string, Check>>): Check | undefined {
  return Object.hasOwn(checks, name) ? checks[name] : undefined;
}

/** A host message of type `type` with these fields besides `type`. */
function message(type: string, fields: Readonly<Record<string, Check>> = {}): Check {
  return exactly({ type: oneOf(type), ...fields });
}

/** Passes when any of `checks` passes. */
const anyOf =
  (...checks: readonly Check[]): Check =>
  (value) =>
    checks.some((check) => check(value));

const isState = oneOf("running", "waiting", "done", "failed");
const isDecision = oneOf("approve", "deny");

const isSession = exactly({
  id: isId,
  title: isText,
  state: isState,
  lastSeq: isWhole,
  updatedAt: isText,
});

const isApproval = exactly(
  { id: isId, summary: isText, risk: oneOf("normal", "risky") },
  { connector: isText },
);

/** The four kinds of event body, by their `type`. */
const eventBodies: Readonly<Record<string, Check>> = {
  message: message("message", { role: oneOf("user", "agent"), text: isText }),
  state: message("state", { state: isState }),
  "approval-requested": message("approval-requested", { approval: isApproval }),
  "approval-settled": message("approval-settled", { approvalId: isId, decision: isDecision }),
};

const isEventBody: Check = (value) => {
  const type = isObject(value) ? value["type"] : undefined;
  const check = typeof type === "string" ? fieldCheck(type, eventBodies) : undefined;
  return check?.(value) === true;
};

const isMessagingId: Check = (value) => typeof value === "string" && value !== "";

/** The refusals a port's `AnswerResult` or `SendResult` may carry. */
const isMessagingRefusal = oneOf(
  "offline",
  "signed-out",
  "not-found",
  "too-large",
  "unsupported-type",
  "bad-answer",
  "bad-members",
  "not-supported",
);

const isAuthor = anyOf(
  exactly({ kind: oneOf("me") }),
  exactly({ kind: oneOf("agent"), agent: isMessagingId, name: isText }),
  exactly({ kind: oneOf("person"), name: isText }),
);

/** An `AnswerResult` or a `SendResult`; the client checks it fits what it asked. */
const isMessagingResult = anyOf(
  exactly({ outcome: oneOf("answered"), answeredAt: isText }),
  exactly({ outcome: oneOf("already-answered"), by: isAuthor, answeredAt: isText }),
  exactly({ outcome: oneOf("refused"), reason: isMessagingRefusal }),
  exactly({ outcome: oneOf("sent"), message: isObject }),
);

/** A page of port values: each item one object, its fields the port's own. */
const isMessagingPage = exactly(
  {
    type: oneOf("msg-data"),
    replyTo: isId,
    what: oneOf(...gatewayMessagingLists, "messages", "hits"),
    items: listOf(isObject),
  },
  { more: isMessagingId },
);

/** The types only version 4 lists: a version 3 host never sends them. */
const versionFourTypes = new Set(["msg-data", "msg-result", "msg-changed", "team-data"]);

/**
 * Every message the host may send, by its `type`. `error` has two shapes:
 * a closing one without `replyTo`, and a refusal that names the message it
 * answers.
 */
const hostMessages: Readonly<Record<GatewayHostMessage["type"], readonly Check[]>> = {
  welcome: [message("welcome", { replyTo: isId, version: isWhole, maxMessageBytes: isPositive })],
  // `replyTo` is absent when the host pushes the list after its risky switch changed.
  sessions: [
    message("sessions", { replyTo: isId, sessions: listOf(isSession), answersRisky: isBoolean }),
    message("sessions", { sessions: listOf(isSession), answersRisky: isBoolean }),
  ],
  event: [message("event", { sessionId: isId, seq: isPositive, at: isText, body: isEventBody })],
  ok: [message("ok", { replyTo: isId })],
  paired: [message("paired")],
  "pair-refused": [message("pair-refused", { reason: oneOf("denied", "timed-out") })],
  "not-paired": [message("not-paired")],
  error: [
    message("error", { code: oneOf(...gatewayClosingErrorCodes) }),
    message("error", { replyTo: isId, code: oneOf(...gatewayRefusalCodes) }),
  ],
  "msg-data": [isMessagingPage],
  "msg-result": [message("msg-result", { replyTo: isId, result: isMessagingResult })],
  "msg-changed": [message("msg-changed", { source: isMessagingId })],
  // The phone asks for no team status yet (G3 on HAL-17511), so it takes none.
  "team-data": [],
};

/**
 * Reads one message from the host, as the shell delivered its text. The size
 * comes first: a text over `gatewayMaxMessageBytes` bytes of UTF-8 is never
 * parsed. A `welcome` of another version than `version`, the one the phone's
 * `hello` named, is `other-version` whatever else it holds, since the phone
 * closes on it either way. Version 3 lists the messages of version 4 but
 * the Inbox, Messenger and team status ones, so one table reads both.
 */
export function parseHostMessage(
  text: string,
  version: number = gatewayProtocolVersion,
): HostMessageResult {
  if (utf8BytesOver(text, gatewayMaxMessageBytes)) return refused("too-large");
  const value = jsonObject(text);
  if (value === undefined) return refused("malformed");
  const type = value["type"];
  if (typeof type !== "string" || !Object.hasOwn(hostMessages, type)) return refused("malformed");
  if (version < gatewayProtocolVersion && versionFourTypes.has(type)) return refused("malformed");
  if (type === "welcome" && isWhole(value["version"]) && value["version"] !== version) {
    return refused("other-version");
  }
  const shapes = hostMessages[type as GatewayHostMessage["type"]];
  return shapes.some((shape) => shape(value))
    ? { ok: true, message: value as unknown as GatewayHostMessage }
    : refused("malformed");
}

function refused(problem: HostMessageProblem): HostMessageResult {
  return { ok: false, problem };
}

/**
 * Whether `text` takes more than `limit` bytes in UTF-8. A UTF-16 code unit
 * takes 1 to 3 bytes, so most texts are decided by their length alone.
 */
function utf8BytesOver(text: string, limit: number): boolean {
  if (text.length > limit) return true;
  if (text.length * 3 <= limit) return false;
  return new TextEncoder().encode(text).byteLength > limit;
}

/** `text` as one JSON object, or `undefined` when it isn't one. A byte order mark makes it fail. */
function jsonObject(text: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  return isObject(parsed) ? parsed : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
