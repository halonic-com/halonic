import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { RpcMessageError, readRpcMessage, rpcErrorCodes } from "./json-rpc.ts";

/** The reply `readRpcMessage` throws for `value`. */
function refusal(value: unknown) {
  try {
    readRpcMessage(value);
  } catch (error) {
    if (error instanceof RpcMessageError) return error.reply;
    throw error;
  }
  throw new Error("The message was read.");
}

verifies("harness-bridge.mcp", () => {
  it("reads a request, with empty params when it sends none", () => {
    expect(readRpcMessage({ jsonrpc: "2.0", id: 7, method: "tools/list" })).toEqual({
      kind: "request",
      id: 7,
      method: "tools/list",
      params: {},
    });
    expect(readRpcMessage({ jsonrpc: "2.0", id: "a", method: "ping", params: { x: 1 } })).toEqual({
      kind: "request",
      id: "a",
      method: "ping",
      params: { x: 1 },
    });
  });

  it("reads a notification and a response", () => {
    expect(readRpcMessage({ jsonrpc: "2.0", method: "notifications/initialized" })).toEqual({
      kind: "notification",
      method: "notifications/initialized",
    });
    expect(readRpcMessage({ jsonrpc: "2.0", id: 1, result: {} })).toEqual({ kind: "response" });
    expect(readRpcMessage({ jsonrpc: "2.0", id: 1, error: { code: 1 } })).toEqual({
      kind: "response",
    });
  });

  it.each([
    ["a batch", [{ jsonrpc: "2.0", id: 1, method: "ping" }], null],
    ["another version", { jsonrpc: "1.0", id: 1, method: "ping" }, null],
    ["no method", { jsonrpc: "2.0", id: 1 }, 1],
    ["a method that isn't a string", { jsonrpc: "2.0", id: 1, method: 5 }, 1],
    ["a null id", { jsonrpc: "2.0", id: null, method: "ping" }, null],
    ["a fractional id", { jsonrpc: "2.0", id: 1.5, method: "ping" }, null],
    ["params that aren't an object", { jsonrpc: "2.0", id: 2, method: "ping", params: [1] }, 2],
  ])("refuses %s as an invalid request", (_name, value, id) => {
    expect(refusal(value)).toEqual({
      jsonrpc: "2.0",
      id,
      error: { code: rpcErrorCodes.invalidRequest, message: expect.any(String) },
    });
  });
});
