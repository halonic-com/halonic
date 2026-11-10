import { McpError, unexpectedResponse } from "../protocol/errors.ts";
import { errorCodes, type OutgoingMessage } from "../protocol/json-rpc.ts";
import type { AbortSignalLike, McpTransport } from "../protocol/transport.ts";
import { readLines } from "./lines.ts";
import { MessageQueue } from "./message-queue.ts";
import type { RunningProgram } from "./program.ts";
import { stopProgram } from "./stop-program.ts";

/** The limits of one stdio session. */
export interface StdioLimits {
  /** How long the program has to answer one request, `initialize` included. */
  readonly requestTimeoutMs: number;
  /** The largest message the program may send, in bytes. */
  readonly maxMessageBytes: number;
  /** How long the program gets after each step of stopping it. */
  readonly stopGraceMs: number;
}

/** The limits a stdio connector uses unless it is given others. */
export const defaultStdioLimits: StdioLimits = {
  requestTimeoutMs: 60_000,
  maxMessageBytes: 4 * 1024 * 1024,
  stopGraceMs: 2000,
};

/**
 * MCP over a local program's standard input and output: one JSON-RPC
 * message per line
 * (https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio).
 *
 * One stream carries every answer, so a reader routes each to its waiting
 * request by id. A request or notification from the server goes to the
 * oldest waiting request, whose session handles it. With no request
 * waiting, a notification is dropped and a request is answered here: `ping`
 * succeeds and anything else is refused, as the session would. A
 * cancelled request fails on its own; the session and the program go on.
 *
 * The session ends, failing every waiting request and stopping the
 * program, when a request isn't answered in time, the program sends a line
 * that is too long or isn't JSON, its output ends, or the transport is
 * closed. Standard error is read and dropped, never kept or parsed.
 */
export class StdioTransport implements McpTransport {
  readonly #program: RunningProgram;
  readonly #limits: StdioLimits;
  readonly #waiting = new Map<number, MessageQueue>();
  #ended: McpError | undefined;
  #stopped: Promise<void> | undefined;

  constructor(program: RunningProgram, limits: StdioLimits) {
    this.#program = program;
    this.#limits = limits;
    this.#readOutput().catch((error: unknown) => this.#end(asMcpError(error)));
    drain(program.stderr);
  }

  async *send(message: OutgoingMessage, signal?: AbortSignalLike): AsyncGenerator<unknown> {
    this.#throwIfEnded(signal);
    if (!("id" in message && "method" in message)) {
      await this.#write(message);
      return;
    }
    const queue = new MessageQueue();
    this.#waiting.set(message.id, queue);
    const timer = setTimeout(
      () => this.#end(notAnsweredInTime(message.method, this.#limits.requestTimeoutMs)),
      this.#limits.requestTimeoutMs,
    );
    // A cancel fails this request only. The session and the program carry
    // on, and the session tells the server it can stop working on it.
    const cancel = () => {
      this.#waiting.delete(message.id);
      queue.fail(new McpError("unavailable", "The request was cancelled."));
    };
    signal?.addEventListener?.("abort", cancel);
    try {
      await this.#write(message);
      yield* queue.read();
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", cancel);
      this.#waiting.delete(message.id);
    }
  }

  /** Nothing to do: stdio has no headers to carry the version in. */
  useProtocolVersion(_version: string): void {}

  /** Fails every waiting request and stops the program. Safe to call twice. */
  async close(): Promise<void> {
    this.#end(new McpError("unavailable", "The connection to the program was closed."));
    await this.#stopped;
  }

  #throwIfEnded(signal: AbortSignalLike | undefined): void {
    if (this.#ended !== undefined) throw this.#ended;
    if (signal?.aborted === true) {
      throw new McpError("unavailable", "The request was cancelled before it was sent.");
    }
  }

  async #write(message: OutgoingMessage): Promise<void> {
    try {
      await this.#program.write(`${JSON.stringify(message)}\n`);
    } catch {
      const error = new McpError("unavailable", "The program stopped reading its input.");
      this.#end(error);
      throw error;
    }
  }

  async #readOutput(): Promise<void> {
    for await (const line of readLines(this.#program.stdout, this.#limits.maxMessageBytes)) {
      if (this.#ended !== undefined) return;
      if (line.trim() === "") continue;
      await this.#route(parseLine(line));
    }
    this.#end(new McpError("unavailable", "The program stopped."));
  }

  async #route(value: unknown): Promise<void> {
    const id = answerId(value);
    if (id !== undefined) {
      // An answer to an id nobody waits for is stale; the session ignores those too.
      const queue = this.#waiting.get(id);
      // Answered, so it is no longer the oldest: later messages go to the next one.
      this.#waiting.delete(id);
      queue?.finish(value);
      return;
    }
    const oldest = this.#waiting.values().next().value;
    if (oldest !== undefined) {
      oldest.push(value);
      return;
    }
    await this.#answerWhileIdle(value);
  }

  async #answerWhileIdle(value: unknown): Promise<void> {
    if (!isObject(value)) return;
    const { id, method } = value;
    if (typeof method !== "string" || !isRequestId(id)) return;
    const answer: OutgoingMessage =
      method === "ping"
        ? { jsonrpc: "2.0", id, result: {} }
        : {
            jsonrpc: "2.0",
            id,
            error: { code: errorCodes.methodNotFound, message: "Method not found" },
          };
    await this.#write(answer);
  }

  /** Ends the session once: the first reason wins. */
  #end(error: McpError): void {
    if (this.#ended !== undefined) return;
    this.#ended = error;
    for (const queue of this.#waiting.values()) queue.fail(error);
    // `RunningProgram` promises not to throw while stopping; this guards the
    // Node process against an unhandled rejection if a starter breaks that.
    this.#stopped = stopProgram(this.#program, this.#limits.stopGraceMs).then(
      () => undefined,
      () => undefined,
    );
  }
}

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    throw unexpectedResponse();
  }
}

/**
 * The id of a message that answers one of our requests. We send numeric
 * ids only. An error with a `null` id answers a request the server
 * couldn't read, which we can't tell apart, so it goes to the oldest.
 */
function answerId(value: unknown): number | undefined {
  if (!isObject(value) || "method" in value) return undefined;
  const { id } = value;
  return typeof id === "number" ? id : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRequestId(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function notAnsweredInTime(method: string, timeoutMs: number): McpError {
  return new McpError(
    "unavailable",
    `The program didn't answer ${method} within ${Math.round(timeoutMs / 1000)} seconds, so it was stopped.`,
  );
}

function asMcpError(error: unknown): McpError {
  return error instanceof McpError
    ? error
    : new McpError("unavailable", "Reading the program's output failed.");
}

/** Reads a stream to its end and drops what it says, so the program never blocks on a full pipe. */
function drain(stream: AsyncIterable<Uint8Array>): void {
  (async () => {
    for await (const _chunk of stream) {
      // Never kept: a program's error output can hold anything.
    }
  })().catch(() => undefined);
}
