import {
  type GatewayClientMessage,
  gatewayMaxIdLength,
  gatewayMaxMessageBytes,
  gatewayMaxPromptLength,
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

/** The fields each message carries besides `type`, and how each is checked. */
const fieldChecks: Record<
  GatewayClientMessage["type"],
  Readonly<Record<string, (value: unknown) => boolean>>
> = {
  hello: { id: isId, version: Number.isSafeInteger },
  "list-sessions": { id: isId },
  watch: { id: isId, sessionId: isId, afterSeq: isSequence },
  unwatch: { id: isId, sessionId: isId },
  "answer-approval": { id: isId, sessionId: isId, approvalId: isId, decision: isDecision },
  prompt: { id: isId, sessionId: isId, text: isPromptText },
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
  if (typeof type !== "string" || !Object.hasOwn(fieldChecks, type)) return refused("malformed");
  const checks = fieldChecks[type as GatewayClientMessage["type"]];
  const names = Object.keys(value).filter((name) => name !== "type");
  const exact = names.length === Object.keys(checks).length;
  const valid =
    exact && names.every((name) => Object.hasOwn(checks, name) && checks[name]?.(value[name]));
  return valid
    ? { ok: true, message: value as unknown as GatewayClientMessage }
    : refused("malformed");
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

function isSequence(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isDecision(value: unknown): boolean {
  return value === "approve" || value === "deny";
}

function isPromptText(value: unknown): boolean {
  return typeof value === "string" && value.length >= 1 && value.length <= gatewayMaxPromptLength;
}
