import {
  type GatewayClientMessage,
  gatewayMaxAddressees,
  gatewayMaxIdLength,
  gatewayMaxMessageBytes,
  gatewayMaxPromptLength,
  gatewayMaxSearchLength,
  gatewayMessagingIdPattern,
  gatewayMessagingLists,
  gatewayTeamLists,
} from "@halonicjs/ports";

/** One frame as the transport received it: its bytes, and whether it was a binary one. */
export interface GatewayFrame {
  readonly binary: boolean;
  readonly bytes: Uint8Array;
}

/** What {@link parseGatewayClientMessage} made of a frame. */
export type GatewayParseResult =
  | { readonly ok: true; readonly message: GatewayClientMessage }
  | { readonly ok: false; readonly code: "malformed" | "too-large" };

const idPattern = new RegExp(`^[A-Za-z0-9_-]{1,${gatewayMaxIdLength}}$`);
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

type FieldCheck = (value: unknown) => boolean;
type Fields = Readonly<Record<string, FieldCheck>>;

/** The fields a message must carry besides `type`, and the ones it may carry. */
interface FieldSpec {
  readonly required: Fields;
  readonly optional?: Fields;
}

const readMessages: FieldSpec = {
  required: { id: isId, what: isOneOf(["messages"]), conversation: isMessagingId },
  optional: { before: isCursor },
};
const readList: FieldSpec = {
  required: { id: isId, what: isOneOf(gatewayMessagingLists) },
  optional: { cursor: isCursor },
};
const readSpend: FieldSpec = {
  required: { id: isId, what: isOneOf(["spend"]) },
  optional: { range: isOneOf(["today", "week", "month"]) },
};
const readPullRequest: FieldSpec = {
  required: { id: isId, what: isOneOf(["pull-request"]), pullRequest: isMessagingId },
};
const readTeamList: FieldSpec = { required: { id: isId, what: isOneOf(gatewayTeamLists) } };

/** The fields of the version 3 messages, all required. */
const sessionMessages = {
  hello: { required: { id: isId, version: Number.isSafeInteger } },
  "list-sessions": { required: { id: isId } },
  watch: { required: { id: isId, sessionId: isId, afterSeq: isSequence } },
  unwatch: { required: { id: isId, sessionId: isId } },
  "answer-approval": {
    required: { id: isId, sessionId: isId, approvalId: isId, decision: isDecision },
  },
  prompt: { required: { id: isId, sessionId: isId, text: isTextUpTo(gatewayMaxPromptLength) } },
} satisfies Record<string, FieldSpec>;
/** The fields of each message, by its `type`; for `msg-read` and `team-read` also by its `what`. */
const fieldSpecs: Record<
  GatewayClientMessage["type"],
  FieldSpec | ((message: Record<string, unknown>) => FieldSpec)
> = {
  ...sessionMessages,
  "msg-read": (message) => (message["what"] === "messages" ? readMessages : readList),
  "msg-search": { required: { id: isId, text: isTextUpTo(gatewayMaxSearchLength) } },
  "msg-answer": {
    required: { id: isId, item: isMessagingId, answer: isInboxAnswer, confirmed: isTrue },
  },
  "msg-send": {
    required: { id: isId, conversation: isMessagingId, body: isTextUpTo(gatewayMaxPromptLength) },
    optional: { to: isAddressees },
  },
  "msg-watch": { required: { id: isId } },
  "msg-unwatch": { required: { id: isId } },
  "team-read": (message) => {
    if (message["what"] === "spend") return readSpend;
    return message["what"] === "pull-request" ? readPullRequest : readTeamList;
  },
};

/**
 * Reads one frame from a phone, by the rules of requirement
 * `ports.remote-gateway-protocol`. The host and the attack suite's fuzzer use
 * this one function, so they can't disagree on what a valid message is.
 *
 * It checks only what the frame itself shows: the size (before anything is
 * parsed), the encoding, the shape and the limits of each field. What needs
 * the connection's state, such as a message before `hello`, a version other
 * than 1 or an `afterSeq` past a session's `lastSeq`, is the host's to check.
 */
export function parseGatewayClientMessage(frame: GatewayFrame): GatewayParseResult {
  if (frame.bytes.byteLength > gatewayMaxMessageBytes) return refused("too-large");
  if (frame.binary) return refused("malformed");
  const value = decodeJsonObject(frame.bytes);
  if (value === undefined) return refused("malformed");
  const type = value["type"];
  if (typeof type !== "string" || !Object.hasOwn(fieldSpecs, type)) return refused("malformed");
  const specOrPick = fieldSpecs[type as GatewayClientMessage["type"]];
  const spec = typeof specOrPick === "function" ? specOrPick(value) : specOrPick;
  const { type: _type, ...fields } = value;
  return hasExactly(fields, spec)
    ? { ok: true, message: value as unknown as GatewayClientMessage }
    : refused("malformed");
}

/** Whether `value` has every required field, no field the spec doesn't name, and each one valid. */
function hasExactly(value: Record<string, unknown>, spec: FieldSpec): boolean {
  const optional = spec.optional ?? {};
  const required = Object.keys(spec.required);
  if (!required.every((name) => Object.hasOwn(value, name))) return false;
  return Object.keys(value).every((name) => {
    if (Object.hasOwn(spec.required, name)) return spec.required[name]?.(value[name]) === true;
    return Object.hasOwn(optional, name) && optional[name]?.(value[name]) === true;
  });
}

function refused(code: "malformed" | "too-large"): GatewayParseResult {
  return { ok: false, code };
}

/** The frame's text as one JSON object, or `undefined` when it isn't valid UTF-8 or isn't one object. */
function decodeJsonObject(bytes: Uint8Array): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8.decode(bytes));
  } catch {
    return undefined;
  }
  const isObject = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  return isObject ? (parsed as Record<string, unknown>) : undefined;
}

function isId(value: unknown): boolean {
  return typeof value === "string" && idPattern.test(value);
}

/** An id a provider made, such as an Inbox item's; see `gatewayMessagingIdPattern`. */
function isMessagingId(value: unknown): boolean {
  return typeof value === "string" && gatewayMessagingIdPattern.test(value);
}

function isSequence(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isDecision(value: unknown): boolean {
  return value === "approve" || value === "deny";
}

function isTextUpTo(maxLength: number): FieldCheck {
  return (value) => typeof value === "string" && value.length >= 1 && value.length <= maxLength;
}

function isOneOf(allowed: readonly string[]): FieldCheck {
  return (value) => typeof value === "string" && allowed.includes(value);
}

/**
 * A page cursor the phone hands back. `fitPage` passes a provider's own cursor
 * on as `more`, so it follows the messaging id rule, `:` included.
 */
function isCursor(value: unknown): boolean {
  return isMessagingId(value);
}

function isTrue(value: unknown): boolean {
  return value === true;
}

function isAddressees(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= gatewayMaxAddressees &&
    value.every(isMessagingId) &&
    new Set(value).size === value.length
  );
}

const optionAnswer: FieldSpec = {
  required: { kind: isOneOf(["option"]), option: isId },
  optional: { note: isTextUpTo(gatewayMaxPromptLength) },
};
const replyAnswer: FieldSpec = {
  required: { kind: isOneOf(["reply"]), text: isTextUpTo(gatewayMaxPromptLength) },
};

/** An option or a written reply, with exactly its fields; never an action item's stepper result. */
function isInboxAnswer(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const answer = value as Record<string, unknown>;
  return hasExactly(answer, answer["kind"] === "reply" ? replyAnswer : optionAnswer);
}
