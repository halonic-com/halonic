import type { HttpClient } from "@halonicjs/ports";
import { McpError, unexpectedResponse } from "../protocol/errors.ts";
import type { JsonRpcRequest, OutgoingMessage } from "../protocol/json-rpc.ts";
import type { AbortSignalLike, McpTransport } from "../protocol/transport.ts";
import { eventData, readText } from "./body.ts";
import { errorForStatus } from "./http-status.ts";

/** The limits of one HTTP session. */
export interface HttpLimits {
  /** How long the server has to answer one request, `initialize` included. */
  readonly requestTimeoutMs: number;
  /** The largest message the server may send, in bytes. */
  readonly maxMessageBytes: number;
}

/** The limits an HTTP connector uses unless it is given others: the same as stdio's. */
export const defaultHttpLimits: HttpLimits = {
  requestTimeoutMs: 60_000,
  maxMessageBytes: 4 * 1024 * 1024,
};

/** Where and how one HTTP transport reaches its server. */
export interface McpHttpTransportOptions {
  /** Sends every request: the host's `HttpClient`, which may refuse addresses. */
  readonly http: HttpClient;
  /** The server's MCP endpoint. */
  readonly url: string;
  /** Sent with every request: the connector's own headers and its bearer token. */
  readonly headers: Headers;
  readonly limits: HttpLimits;
}

/**
 * The statuses besides `2xx` that end a session without an error when we
 * send `DELETE`. `404` and `410`: the session is already gone. `405`: the
 * server doesn't let clients end sessions and ends them itself.
 */
const sessionAlreadyEndedStatuses: ReadonlySet<number> = new Set([404, 405, 410]);

/**
 * The streamable HTTP transport
 * (https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http),
 * ported from `integrations/mcp` onto the host's `HttpClient`.
 *
 * Every message is a `POST` to one endpoint. The server answers a request
 * with one JSON message, or with an event stream that carries its own
 * requests and notifications before the answer. It may hand out a session
 * id in its answer to `initialize`, which we send back with every later
 * message, and which `close` ends with `DELETE`.
 *
 * Unlike the integration's transport it doesn't resume a dropped stream:
 * the request fails, and the next one works as before. Each request,
 * reading its answer included, has the request timeout, and each message
 * the message limit. No request follows a redirect, so the bearer token in
 * the headers goes to the connector's own address only.
 */
export class McpHttpTransport implements McpTransport {
  readonly #options: McpHttpTransportOptions;
  #sessionId: string | undefined;
  #protocolVersion: string | undefined;

  constructor(options: McpHttpTransportOptions) {
    this.#options = options;
  }

  async *send(message: OutgoingMessage, signal?: AbortSignalLike): AsyncGenerator<unknown> {
    const name = isRequest(message) ? message.method : "a message";
    const deadline = new Deadline(this.#options.limits.requestTimeoutMs, signal);
    try {
      const response = await this.#fetch("POST", JSON.stringify(message), deadline.signal);
      this.#rememberSession(response, message);
      if (!isRequest(message)) {
        // A notification or a response: the server only confirms it got it (202).
        await discardBody(response);
        return;
      }
      yield* this.#readAnswer(response, message.id);
    } catch (error) {
      throw deadline.explain(error, name);
    } finally {
      deadline.end();
    }
  }

  useProtocolVersion(version: string): void {
    this.#protocolVersion = version;
  }

  async close(signal?: AbortSignalLike): Promise<void> {
    if (this.#sessionId === undefined) return;
    const deadline = new Deadline(this.#options.limits.requestTimeoutMs, signal);
    try {
      await discardBody(await this.#fetch("DELETE", undefined, deadline.signal));
    } catch (error) {
      throw deadline.explain(error, "the end of the session");
    } finally {
      this.#sessionId = undefined;
      deadline.end();
    }
  }

  async *#readAnswer(response: Response, id: number): AsyncGenerator<unknown> {
    const { maxMessageBytes } = this.#options.limits;
    const contentType = mediaType(response);
    if (contentType === "application/json" && response.body !== null) {
      yield parseJson(await readText(response.body, maxMessageBytes));
      return;
    }
    if (contentType !== "text/event-stream" || response.body === null) {
      await discardBody(response);
      throw unexpectedResponse();
    }
    for await (const data of eventData(response.body, maxMessageBytes)) {
      const value = parseJson(data);
      yield value;
      // Stops reading, which cancels the stream: the server may keep it open.
      if (isAnswerTo(value, id)) return;
    }
  }

  /**
   * Sends one HTTP request with the headers every MCP message needs, and
   * throws our error for a refused one; the server's text is never read.
   */
  async #fetch(method: string, body: string | undefined, signal: AbortSignal): Promise<Response> {
    const headers = new Headers(this.#options.headers);
    headers.set("accept", "application/json, text/event-stream");
    if (body !== undefined) headers.set("content-type", "application/json");
    if (this.#sessionId !== undefined) headers.set("mcp-session-id", this.#sessionId);
    if (this.#protocolVersion !== undefined) {
      headers.set("mcp-protocol-version", this.#protocolVersion);
    }
    const response = await this.#options.http.fetch(this.#options.url, {
      method,
      headers,
      redirect: "error",
      signal,
      ...(body === undefined ? {} : { body }),
    });
    if (response.ok) return response;
    await discardBody(response);
    // A session the server already ended, or ends itself, is ended all the same.
    if (method === "DELETE" && sessionAlreadyEndedStatuses.has(response.status)) return response;
    throw errorForStatus(response.status, this.#sessionId !== undefined);
  }

  /** The server may hand out a session id in its answer to `initialize`. */
  #rememberSession(response: Response, message: OutgoingMessage): void {
    if (!isRequest(message) || message.method !== "initialize") return;
    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId === null) return;
    // The spec allows visible ASCII only; anything else could break our headers.
    if (!/^[\x21-\x7e]{1,256}$/.test(sessionId)) throw unexpectedResponse();
    this.#sessionId = sessionId;
  }
}

/**
 * One request's time limit, joined with the caller's signal: aborting
 * either aborts the request and the reading of its answer.
 */
class Deadline {
  readonly #controller = new AbortController();
  readonly #timer: ReturnType<typeof setTimeout>;
  readonly #timeoutMs: number;
  readonly #caller: AbortSignalLike | undefined;
  readonly #onCallerAbort = () => this.#controller.abort();
  #timedOut = false;

  constructor(timeoutMs: number, caller: AbortSignalLike | undefined) {
    this.#timeoutMs = timeoutMs;
    this.#caller = caller;
    this.#timer = setTimeout(() => {
      this.#timedOut = true;
      this.#controller.abort();
    }, timeoutMs);
    if (caller?.aborted === true) this.#controller.abort();
    caller?.addEventListener?.("abort", this.#onCallerAbort);
  }

  get signal(): AbortSignal {
    return this.#controller.signal;
  }

  /** Our error for a request that was cut short, or `error` as it is. */
  explain(error: unknown, name: string): unknown {
    if (this.#timedOut) {
      return new McpError(
        "unavailable",
        `The MCP server didn't answer ${name} within ${Math.round(this.#timeoutMs / 1000)} seconds.`,
      );
    }
    if (this.#caller?.aborted === true) {
      return new McpError("unavailable", "The request was cancelled.");
    }
    return error;
  }

  end(): void {
    clearTimeout(this.#timer);
    this.#caller?.removeEventListener?.("abort", this.#onCallerAbort);
  }
}

function isRequest(message: OutgoingMessage): message is JsonRpcRequest {
  return "method" in message && "id" in message;
}

/**
 * Cancels the body of an answer we don't read, so the connection can close
 * or be reused instead of staying open until the server gives up. A
 * failure to cancel changes nothing for the caller, so it is ignored.
 */
async function discardBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

/** The content type without parameters such as `charset`. */
function mediaType(response: Response): string {
  return (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

/** True when `value` is the result or error for request `id`; the session checks it fully. */
function isAnswerTo(value: unknown, id: number): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    value.id === id &&
    !("method" in value)
  );
}

/** Never lets a parse error out: it would quote part of the server's text. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw unexpectedResponse();
  }
}
