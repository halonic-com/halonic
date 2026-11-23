// MCP's stdio transport for the coding tools: one JSON-RPC message per line
// on the server's input, one reply per line on its output
// (https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio).
// The output carries nothing else: no tool writes to it, and a test command's
// output goes to its log file.

import { readLines } from "@halonicjs/adapter-harness-kit";
import type { McpToolServer, RequestId } from "@halonicjs/adapter-mcp/server";
import { encodeUtf8, isPlainObject } from "@halonicjs/std";

/** The longest message read, in characters; tool calls are far smaller. */
const maxMessageCharacters = 1_000_000;

/** The server's two ends of the channel to its client. */
export interface StdioChannel {
  /** What the client sends. */
  readonly input: ReadableStream<Uint8Array>;
  /** Sends one line, without its line break, to the client. */
  write(line: string): void;
}

/** What a line says about cancelling, read before the server answers it. */
interface LineHeader {
  /** The request's id, when the line is a request. */
  readonly id: RequestId | undefined;
  /** The request a `notifications/cancelled` line cancels. */
  readonly cancels: RequestId | undefined;
}

/**
 * Serves `server` on the channel until its input ends (requirement
 * `coding-tools.stdio`). Requests are answered as they finish, so a ping
 * isn't held up by a long test run. A `notifications/cancelled` stops the
 * call it names, which then gets no reply, as MCP asks. When the input ends,
 * every call still running is cancelled and waited for.
 */
export async function serveOverStdio(
  server: McpToolServer,
  channel: StdioChannel,
  reportError: (error: unknown) => void,
): Promise<void> {
  const running = new Map<RequestId, AbortController>();
  const answering = new Set<Promise<void>>();
  for await (const line of readLines(channel.input, { maxLineLength: maxMessageCharacters })) {
    if (line.trim() === "") continue;
    const header = lineHeader(line);
    if (header.cancels !== undefined) {
      running.get(header.cancels)?.abort();
      continue;
    }
    const controller = new AbortController();
    if (header.id !== undefined) running.set(header.id, controller);
    const answer = server
      .answerBytes(encodeUtf8(line), { signal: controller.signal })
      .then((reply) => {
        if (reply !== null && !controller.signal.aborted) channel.write(JSON.stringify(reply));
      })
      .catch(reportError)
      .finally(() => {
        if (header.id !== undefined && running.get(header.id) === controller)
          running.delete(header.id);
        answering.delete(answer);
      });
    answering.add(answer);
  }
  for (const controller of running.values()) controller.abort();
  await Promise.allSettled([...answering]);
}

/** The id of a request, or the request a cancel names; the server reads the rest itself. */
function lineHeader(line: string): LineHeader {
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    // The server answers a line that isn't JSON with a parse error.
    return { id: undefined, cancels: undefined };
  }
  if (!isPlainObject(message)) return { id: undefined, cancels: undefined };
  const params = isPlainObject(message["params"]) ? message["params"] : {};
  const cancels =
    message["method"] === "notifications/cancelled" ? requestId(params["requestId"]) : undefined;
  return { id: requestId(message["id"]), cancels };
}

function requestId(value: unknown): RequestId | undefined {
  return typeof value === "string" || Number.isSafeInteger(value)
    ? (value as RequestId)
    : undefined;
}
