/**
 * The wire format of Paperclip's plugin worker protocol, written down here so
 * the worker ships no Paperclip code: JSON-RPC 2.0, one message per line,
 * over the worker process's stdin and stdout. Written against the SDK
 * version below; a host that speaks another API version is refused.
 */

/** The `@paperclipai/plugin-sdk` version this protocol was written against. */
export const pinnedSdkVersion = "2026.1117.0";

/** The plugin API version that SDK speaks (`PLUGIN_API_VERSION`). */
export const pluginApiVersion = 1;

/** The longest line the worker reads; a longer one is refused, not parsed. */
export const maxFrameLength = 4 * 1024 * 1024;

/** How long a call back to Paperclip may take before the worker gives up on it. */
export const hostCallTimeoutMs = 9_000;

/** JSON-RPC's own error codes, and Paperclip's from its server range. */
export const rpcErrors = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  capabilityDenied: -32001,
  workerError: -32002,
  timeout: -32003,
} as const;

export type RpcId = string | number;

/** One message read from Paperclip, sorted by its shape. */
export type Frame =
  | {
      readonly kind: "request";
      readonly id: RpcId;
      readonly method: string;
      readonly params: unknown;
      readonly invocationId?: string;
    }
  | { readonly kind: "notification"; readonly method: string }
  | { readonly kind: "result"; readonly id: RpcId; readonly result: unknown }
  | {
      readonly kind: "error";
      readonly id: RpcId;
      readonly error: { readonly code: number; readonly message: string };
    }
  | {
      readonly kind: "invalid";
      readonly id: RpcId | null;
      readonly code: number;
      readonly message: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is RpcId {
  return typeof value === "string" || (typeof value === "number" && Number.isSafeInteger(value));
}

/** The invocation id Paperclip gives a call, which calls back made for it echo. */
function invocationIdOf(message: Record<string, unknown>): string | undefined {
  const invocation = message["paperclipInvocation"];
  return isRecord(invocation) && typeof invocation["id"] === "string"
    ? invocation["id"]
    : undefined;
}

function invalid(id: RpcId | null, code: number, message: string): Frame {
  return { kind: "invalid", id, code, message };
}

/** A message with a `method`: a request Paperclip waits on, or a notification it doesn't. */
function readCall(message: Record<string, unknown>, method: string): Frame {
  if (!("id" in message)) return { kind: "notification", method };
  const id = message["id"];
  if (!isId(id)) return invalid(null, rpcErrors.invalidRequest, "a request has no usable id.");
  const invocationId = invocationIdOf(message);
  return {
    kind: "request",
    id,
    method,
    params: message["params"],
    ...(invocationId === undefined ? {} : { invocationId }),
  };
}

/** A message without a `method`: Paperclip's answer to one of the worker's calls. */
function readAnswer(message: Record<string, unknown>): Frame {
  const id = isId(message["id"]) ? message["id"] : null;
  if (id === null) return invalid(null, rpcErrors.invalidRequest, "an answer has no usable id.");
  if ("result" in message && !("error" in message)) {
    return { kind: "result", id, result: message["result"] };
  }
  const error = message["error"];
  if (isRecord(error) && typeof error["code"] === "number") {
    const text = typeof error["message"] === "string" ? error["message"] : "no message";
    return { kind: "error", id, error: { code: error["code"], message: text } };
  }
  return invalid(id, rpcErrors.invalidRequest, "a message is neither a request nor a response.");
}

/** Reads one line. Never throws: a line that isn't a JSON-RPC 2.0 message is `invalid`. */
export function parseFrame(line: string): Frame {
  if (line.length > maxFrameLength) {
    const why = `a message is longer than ${maxFrameLength} characters.`;
    return invalid(null, rpcErrors.invalidRequest, why);
  }
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    return invalid(null, rpcErrors.parse, "a message isn't JSON.");
  }
  if (!isRecord(message) || message["jsonrpc"] !== "2.0") {
    return invalid(null, rpcErrors.invalidRequest, 'a message isn\'t a JSON-RPC "2.0" object.');
  }
  const method = message["method"];
  return typeof method === "string" ? readCall(message, method) : readAnswer(message);
}

/** One line to write: the message as JSON and a newline. */
export function frame(message: Record<string, unknown>): string {
  return `${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`;
}

/** An error the worker answers a request with: a JSON-RPC code and a message. */
export class RpcError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}
