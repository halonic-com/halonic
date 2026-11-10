import type {
  BridgeRecorder,
  BridgeToolResult,
  BridgeTools,
  ToolDefinition,
} from "@halonicjs/ports";
import { decodeUtf8, isPlainObject } from "@halonicjs/std";
import {
  type RequestId,
  type RpcMessage,
  RpcMessageError,
  type RpcReply,
  readRpcMessage,
  rpcError,
  rpcErrorCodes,
  rpcResult,
} from "./json-rpc.ts";

/**
 * The MCP versions the bridge speaks, newest first. They differ in nothing
 * the bridge serves: `initialize`, `ping`, `tools/list` and `tools/call`.
 */
export const supportedMcpVersions = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;

/**
 * What the program reads when listing or checking the tools failed inside
 * Halonic. The failure's own text isn't the program's to read.
 */
const internalMessage = "Something went wrong in Halonic while answering this request.";

/**
 * What the program reads for a call that needs a person's OK. Asking for it
 * comes with the bridge's approvals (build plan B7); until then such a call
 * doesn't run.
 */
const needsApprovalReason = "this call needs a person's OK, and the bridge can't ask for one yet";

/** What an {@link McpToolServer} serves, and where it records the calls. */
export interface McpToolServerOptions {
  /** The agent the recorded events name. */
  agent: string;
  tools: BridgeTools;
  recorder: BridgeRecorder;
}

/**
 * Halonic's tools for one agent as an MCP server, without a transport: it
 * answers one JSON-RPC message at a time (requirement `harness-bridge.mcp`).
 * The bridge's `POST /mcp` serves it over HTTP; a command that serves it
 * over stdio can use it as it is.
 *
 * Every call is checked by {@link BridgeTools.check} first, so the agent's
 * `allow` and `approve` lists, "allow sending" and the workspace's trust
 * apply as in the built-in loop. A refused call doesn't run and isn't
 * recorded; the program gets the reason as the call's error result. A call
 * that runs is recorded as `tool.called` and `tool.result`.
 *
 * @example
 * const server = new McpToolServer({ agent, tools, recorder });
 * const reply = await server.answerText(line, { signal });
 * if (reply !== null) write(JSON.stringify(reply));
 */
export class McpToolServer {
  readonly #options: McpToolServerOptions;

  constructor(options: McpToolServerOptions) {
    this.#options = options;
  }

  /**
   * Answers one message as it was sent, in UTF-8. A batch (a JSON array) is
   * refused: MCP has had no batches since 2025-06-18.
   *
   * @returns the reply, or `null` for a notification or a response, which get none
   */
  async answerBytes(body: Uint8Array, options: { signal: AbortSignal }): Promise<RpcReply | null> {
    let value: unknown;
    try {
      value = JSON.parse(decodeUtf8(body));
    } catch {
      return rpcError(null, rpcErrorCodes.parseError, "The message isn't valid JSON.");
    }
    let message: RpcMessage;
    try {
      message = readRpcMessage(value);
    } catch (error) {
      if (error instanceof RpcMessageError) return error.reply;
      throw error;
    }
    return this.answer(message, options);
  }

  /** Answers one message; `null` for a notification or a response, which get no reply. */
  async answer(message: RpcMessage, options: { signal: AbortSignal }): Promise<RpcReply | null> {
    if (message.kind !== "request") return null;
    try {
      return await this.#answerRequest(message.id, message.method, message.params, options.signal);
    } catch {
      return rpcError(message.id, rpcErrorCodes.internalError, internalMessage);
    }
  }

  async #answerRequest(
    id: RequestId,
    method: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<RpcReply> {
    switch (method) {
      case "initialize":
        return rpcResult(id, initializeResult(params["protocolVersion"]));
      case "ping":
        return rpcResult(id, {});
      case "tools/list": {
        const tools = await this.#options.tools.list();
        return rpcResult(id, { tools: tools.map(mcpTool) });
      }
      case "tools/call":
        return this.#callTool(id, params, signal);
      default:
        return rpcError(id, rpcErrorCodes.methodNotFound, `The bridge doesn't serve ${method}.`);
    }
  }

  async #callTool(
    id: RequestId,
    params: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<RpcReply> {
    const name = params["name"];
    const args = params["arguments"] ?? {};
    if (typeof name !== "string") {
      return rpcError(id, rpcErrorCodes.invalidParams, "tools/call needs the tool's name.");
    }
    if (!isPlainObject(args)) {
      return rpcError(id, rpcErrorCodes.invalidParams, "A tool's arguments must be an object.");
    }
    const check = await this.#options.tools.check(name, args);
    switch (check.kind) {
      case "refused":
        return rpcResult(id, toolCallResult(`Refused: ${check.reason}`, true));
      case "ask":
        return rpcResult(id, toolCallResult(`Refused: ${needsApprovalReason}`, true));
      case "run": {
        const { result, outcome } = await this.#runTool(name, args, signal);
        return rpcResult(id, toolCallResult(result, outcome !== "ok"));
      }
    }
  }

  /** Runs a call the check let through, recording it before and after. */
  async #runTool(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<BridgeToolResult> {
    const { agent, tools, recorder } = this.#options;
    await recorder.record({ type: "tool.called", agent, tool: name, args });
    const ended = await callOrBreakOff(tools, name, args, signal);
    await recorder.record({ type: "tool.result", agent, tool: name, ...ended });
    return ended;
  }
}

/**
 * How a call ended. A tool that fails answers with `outcome: "error"`, so a
 * call that throws instead broke off, for instance because the program went
 * away: whether it did its work is `unknown`.
 */
async function callOrBreakOff(
  tools: BridgeTools,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<BridgeToolResult> {
  try {
    return await tools.call(name, args, { signal });
  } catch {
    return { result: `The tool ${name} broke off without an answer.`, outcome: "unknown" };
  }
}

/**
 * The answer to `initialize`: the client's MCP version when the bridge speaks
 * it, otherwise the newest one it does, which the client may then refuse.
 */
function initializeResult(asked: unknown): Record<string, unknown> {
  const version = supportedMcpVersions.find((supported) => supported === asked);
  return {
    protocolVersion: version ?? supportedMcpVersions[0],
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "halonic", title: "Halonic", version: "1" },
  };
}

/** A tool as `tools/list` names it. MCP needs an object schema, so one without a type gets it. */
function mcpTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: { type: "object", ...tool.parameters },
  };
}

function toolCallResult(text: string, isError: boolean): Record<string, unknown> {
  return { content: [{ type: "text", text }], isError };
}
