import type { HttpClient } from "@halonicjs/ports";
import type { MessageSink } from "../stdio/fake-program.spec.ts";

/** What a fake MCP server does with one message: it sends its replies, the answer last. */
export type FakeMcpHandler = (message: Record<string, unknown>, sink: MessageSink) => void;

/** One HTTP request that reached the fake server. */
export interface SeenRequest {
  readonly method: string;
  readonly headers: Headers;
  readonly redirect: RequestInit["redirect"];
  /** The JSON-RPC message of a `POST`. */
  readonly message: Record<string, unknown> | undefined;
}

/** How the fake server answers a request: one JSON message, or an event stream of all its replies. */
export type AnswerStyle = "json" | "event-stream";

/**
 * An MCP server behind a fake `HttpClient`: every `POST` goes to `handler`,
 * and the server answers as `style` says. It hands out a session id in its
 * answer to `initialize` when `sessionId` is set.
 */
export class FakeMcpHttpServer implements HttpClient {
  readonly requests: SeenRequest[] = [];
  readonly #handler: FakeMcpHandler;
  readonly #style: AnswerStyle;
  readonly #sessionId: string | undefined;

  constructor(handler: FakeMcpHandler, style: AnswerStyle = "json", sessionId?: string) {
    this.#handler = handler;
    this.#style = style;
    this.#sessionId = sessionId;
  }

  async fetch(_url: string, init?: RequestInit): Promise<Response> {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : undefined;
    const message = body === undefined ? undefined : (JSON.parse(body) as Record<string, unknown>);
    const headers = new Headers(init?.headers);
    this.requests.push({ method, headers, redirect: init?.redirect, message });
    if (message === undefined) return new Response(null, { status: 204 });
    const replies: unknown[] = [];
    this.#handler(message, { send: (reply) => replies.push(reply) });
    if (!("id" in message && "method" in message)) return new Response(null, { status: 202 });
    const sessionHeaders: Record<string, string> =
      message["method"] === "initialize" && this.#sessionId !== undefined
        ? { "mcp-session-id": this.#sessionId }
        : {};
    return this.#style === "json"
      ? Response.json(replies.at(-1), { headers: sessionHeaders })
      : eventStreamResponse(replies, sessionHeaders);
  }

  /** The messages of every `POST` so far, in order. */
  messages(): Record<string, unknown>[] {
    return this.requests.flatMap((request) =>
      request.message === undefined ? [] : [request.message],
    );
  }
}

/** An event-stream answer that carries each message as one event. */
export function eventStreamResponse(
  messages: readonly unknown[],
  headers: Record<string, string> = {},
): Response {
  const text = messages.map((message) => `data: ${JSON.stringify(message)}\n\n`).join("");
  return new Response(text, {
    headers: { ...headers, "content-type": "text/event-stream" },
  });
}
