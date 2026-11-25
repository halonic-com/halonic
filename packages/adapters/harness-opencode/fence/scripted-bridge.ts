import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

/** A request the scripted bridge got: its method and path, never its headers. */
export interface BridgeRequest {
  method: string;
  path: string;
}

/** What one scripted reply asks OpenCode for: a tool call, or the final answer. */
type ScriptedTurn =
  | { kind: "tool"; name: string; input: Record<string, unknown> }
  | { kind: "answer"; text: string };

/**
 * The name a program calls a socket bridge by, as Halonic's bridge
 * (`socketBridgeName` in harness-bridge): srt's proxy sends port 80 of it to
 * the socket.
 */
export const bridgeName = "bridge.halonic.invalid";

/** A running scripted bridge, and every request it got. */
export interface ScriptedBridge {
  /** The bridge's address, as the harness gets it: `http://bridge.halonic.invalid`. */
  url: string;
  /** The Unix socket it serves, outside the fence. */
  socketPath: string;
  requests: BridgeRequest[];
  close(): Promise<void>;
}

/** The final answer of the script, which the run ends with. */
export const scriptedAnswer = "The file says hello from acme.";

/**
 * Starts a stand-in for Halonic's bridge on the Unix socket `socketPath`,
 * the way the agent host serves it on Linux and macOS: it answers
 * Anthropic-style Messages calls from a script, so OpenCode runs real tools,
 * and its MCP route with an MCP server that has no tools.
 *
 * The script is a `read` of `readPath`, then a `shell` call, then the
 * answer. Which reply a call gets depends only on how many assistant turns
 * the call already holds, so a retried call gets the same reply.
 */
export async function startScriptedBridge(
  readPath: string,
  socketPath: string,
): Promise<ScriptedBridge> {
  const script: ScriptedTurn[] = [
    { kind: "tool", name: "read", input: { path: readPath } },
    {
      kind: "tool",
      name: "shell",
      input: { command: "echo egress-check", description: "Prints a word" },
    },
    { kind: "answer", text: scriptedAnswer },
  ];
  const requests: BridgeRequest[] = [];
  const server = createServer((request, response) => {
    // Through srt's proxy the request line holds the whole URL; keep only its path.
    requests.push({ method: request.method ?? "", path: pathOf(request) });
    answer(request, response, script).catch((error: unknown) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  return {
    url: `http://${bridgeName}`,
    socketPath,
    requests,
    close: () => closeServer(server),
  };
}

/** Answers one request: a Messages call from the script, the MCP route, or 404. */
async function answer(
  request: IncomingMessage,
  response: ServerResponse,
  script: readonly ScriptedTurn[],
): Promise<void> {
  const body = await readBody(request);
  const path = pathOf(request);
  if (request.method === "POST" && path === "/v1/messages") {
    const call = JSON.parse(body) as { messages?: { role?: string }[] };
    const turnsSoFar = (call.messages ?? []).filter((message) => message.role === "assistant");
    const turn = script[Math.min(turnsSoFar.length, script.length - 1)] ?? script[0];
    if (turn === undefined) throw new Error("The script has no turns.");
    writeStream(response, turn, turnsSoFar.length);
    return;
  }
  if (path === "/mcp") {
    answerMcp(request, response, body);
    return;
  }
  response.statusCode = 404;
  response.end();
}

/** The MCP route: an MCP server with no tools, prompts or resources. */
function answerMcp(request: IncomingMessage, response: ServerResponse, body: string): void {
  if (request.method !== "POST") {
    response.statusCode = 405;
    response.end();
    return;
  }
  const message = JSON.parse(body) as { id?: number | string; method?: string };
  if (message.id === undefined) {
    // A notification gets no answer.
    response.statusCode = 202;
    response.end();
    return;
  }
  const results: Record<string, unknown> = {
    initialize: {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "halonic", version: "0.0.0" },
    },
    "tools/list": { tools: [] },
    "prompts/list": { prompts: [] },
    "resources/list": { resources: [] },
  };
  const result = results[message.method ?? ""];
  const reply =
    result === undefined
      ? { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Not found" } }
      : { jsonrpc: "2.0", id: message.id, result };
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(reply));
}

/** Writes one scripted turn as Anthropic's streamed Messages events. */
function writeStream(response: ServerResponse, turn: ScriptedTurn, index: number): void {
  const usage = { input_tokens: 100, output_tokens: 10 };
  const block =
    turn.kind === "tool"
      ? { type: "tool_use", id: `toolu_0${index + 1}`, name: turn.name, input: {} }
      : { type: "text", text: "" };
  const delta =
    turn.kind === "tool"
      ? { type: "input_json_delta", partial_json: JSON.stringify(turn.input) }
      : { type: "text_delta", text: turn.text };
  const events: [string, unknown][] = [
    [
      "message_start",
      {
        type: "message_start",
        message: {
          id: `msg_0${index + 1}`,
          type: "message",
          role: "assistant",
          model: "acme-model",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage,
        },
      },
    ],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: block }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    [
      "message_delta",
      {
        type: "message_delta",
        delta: { stop_reason: turn.kind === "tool" ? "tool_use" : "end_turn", stop_sequence: null },
        usage: { output_tokens: 10 },
      },
    ],
    ["message_stop", { type: "message_stop" }],
  ];
  response.setHeader("content-type", "text/event-stream");
  response.end(
    events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(""),
  );
}

/** The request's path without its query, whether the request line holds a path or a whole URL. */
function pathOf(request: IncomingMessage): string {
  return new URL(request.url ?? "/", `http://${bridgeName}`).pathname;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}
