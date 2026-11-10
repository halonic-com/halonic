import { isPlainObject } from "@halonicjs/std";

/**
 * JSON-RPC 2.0 messages as an MCP server receives and answers them
 * (https://modelcontextprotocol.io/specification/2025-11-25/basic#messages).
 * Our own small reading of the format: the MCP part of the bridge uses no
 * library (build plan, section 7).
 */
export type RequestId = string | number;

/** The JSON-RPC error codes the bridge answers with. */
export const rpcErrorCodes = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

/** One message from the client, sorted by what it asks of the server. */
export type RpcMessage =
  /** Needs an answer with the same `id`. */
  | { kind: "request"; id: RequestId; method: string; params: Record<string, unknown> }
  /** Needs no answer, such as `notifications/initialized`. */
  | { kind: "notification"; method: string }
  /** The client's answer to a request of the server's. The bridge sends none, so it ignores these. */
  | { kind: "response" };

/** The server's answer to one request. */
export type RpcReply =
  | { jsonrpc: "2.0"; id: RequestId; result: Record<string, unknown> }
  | { jsonrpc: "2.0"; id: RequestId | null; error: { code: number; message: string } };

/** A message that isn't a JSON-RPC request, notification or response, with the error to answer. */
export class RpcMessageError extends Error {
  readonly reply: RpcReply;

  constructor(reply: Extract<RpcReply, { error: unknown }>) {
    super(reply.error.message);
    this.name = "RpcMessageError";
    this.reply = reply;
  }
}

/**
 * Sorts one parsed JSON value into a request, a notification or a response.
 *
 * @throws {RpcMessageError} with an `invalidRequest` reply when it is none of them
 */
export function readRpcMessage(value: unknown): RpcMessage {
  if (!isPlainObject(value) || value["jsonrpc"] !== "2.0") {
    throw invalidRequest(null, "The message isn't a JSON-RPC 2.0 message.");
  }
  const id = isRequestId(value["id"]) ? value["id"] : null;
  const method = value["method"];
  if (method === undefined) {
    if ("result" in value || "error" in value) return { kind: "response" };
    throw invalidRequest(id, "The message has no method.");
  }
  if (typeof method !== "string") throw invalidRequest(id, "The method must be a string.");
  if (!("id" in value)) return { kind: "notification", method };
  if (id === null) throw invalidRequest(null, "A request's id must be a string or a number.");
  const params = value["params"] ?? {};
  if (!isPlainObject(params)) throw invalidRequest(id, "A request's params must be an object.");
  return { kind: "request", id, method, params };
}

/** The successful answer to the request with `id`. */
export function rpcResult(id: RequestId, result: Record<string, unknown>): RpcReply {
  return { jsonrpc: "2.0", id, result };
}

/** The error answer to the request with `id`, or `null` when its id couldn't be read. */
export function rpcError(id: RequestId | null, code: number, message: string): RpcReply {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function invalidRequest(id: RequestId | null, message: string): RpcMessageError {
  return new RpcMessageError({
    jsonrpc: "2.0",
    id,
    error: { code: rpcErrorCodes.invalidRequest, message },
  });
}

// MCP forbids a null id, and a fraction can't be matched reliably by every client.
function isRequestId(value: unknown): value is RequestId {
  return typeof value === "string" || Number.isSafeInteger(value);
}
