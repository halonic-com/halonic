import type { HttpClient } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpSession } from "../protocol/session.ts";
import { contractServer } from "../stdio/fake-program.spec.ts";
import { eventStreamResponse, FakeMcpHttpServer } from "./fake-http-server.spec.ts";
import { type HttpLimits, McpHttpTransport } from "./http-transport.ts";

const limits: HttpLimits = { requestTimeoutMs: 5000, maxMessageBytes: 4096 };
const clientInfo = { name: "halonic", version: "0.1.0" };
const listTools = { jsonrpc: "2.0" as const, id: 1, method: "tools/list" };

function transportFor(http: HttpClient, headers: Record<string, string> = {}): McpHttpTransport {
  const url = "https://notes.acme.test/mcp";
  return new McpHttpTransport({ http, url, headers: new Headers(headers), limits });
}

/** An `HttpClient` that answers every request with `answer`. */
function answering(answer: (init: RequestInit | undefined) => Response | Promise<Response>) {
  return { fetch: async (_url: string, init?: RequestInit) => answer(init) };
}

async function collect(messages: AsyncIterable<unknown>): Promise<unknown[]> {
  const seen: unknown[] = [];
  for await (const message of messages) seen.push(message);
  return seen;
}

afterEach(() => {
  vi.useRealTimers();
});

verifies("mcp.http-transport", () => {
  describe("messages", () => {
    it("posts each message with its headers, keeps the session and never follows a redirect", async () => {
      const server = new FakeMcpHttpServer(contractServer([]), "json", "session-1");
      const session = new McpSession(transportFor(server, { "x-acme": "1" }), { clientInfo });
      await session.initialize();
      await session.listTools();
      const [initialize, initialized, list] = server.requests;
      expect(initialize?.headers.get("accept")).toBe("application/json, text/event-stream");
      expect(initialize?.headers.get("mcp-session-id")).toBeNull();
      for (const request of [initialized, list]) {
        expect(request?.headers.get("mcp-session-id")).toBe("session-1");
        expect(request?.headers.get("mcp-protocol-version")).toBe("2025-11-25");
      }
      for (const request of server.requests) {
        expect(request.method).toBe("POST");
        expect(request.redirect).toBe("error");
        expect(request.headers.get("x-acme")).toBe("1");
      }
    });

    it("reads the server's own requests in an event stream before the answer, and answers them", async () => {
      const server = new FakeMcpHttpServer((message, sink) => {
        if (message["method"] !== "tools/list") return contractServer([])(message, sink);
        sink.send({ jsonrpc: "2.0", id: "ping-1", method: "ping" });
        sink.send({ jsonrpc: "2.0", method: "notifications/message", params: {} });
        sink.send({ jsonrpc: "2.0", id: message["id"], result: { tools: [] } });
      }, "event-stream");
      const session = new McpSession(transportFor(server), { clientInfo });
      await session.initialize();
      expect(await session.listTools()).toEqual([]);
      expect(server.messages().at(-1)).toEqual({ jsonrpc: "2.0", id: "ping-1", result: {} });
    });

    it("stops reading an event stream at the answer, and cancels the rest", async () => {
      const answer = { jsonrpc: "2.0", id: 1, result: { tools: [] } };
      const stream = eventStreamResponse([answer, { jsonrpc: "2.0", id: 9, result: {} }]);
      const transport = transportFor(answering(() => stream));
      expect(await collect(transport.send(listTools))).toEqual([answer]);
      expect(stream.bodyUsed).toBe(true);
    });

    it("ends the session with DELETE on close, and takes a server that already ended it", async () => {
      const server = new FakeMcpHttpServer(contractServer([]), "json", "session-1");
      const transport = transportFor(server);
      await new McpSession(transport, { clientInfo }).initialize();
      await transport.close();
      expect(server.requests.at(-1)?.method).toBe("DELETE");
      expect(server.requests.at(-1)?.headers.get("mcp-session-id")).toBe("session-1");
      await transport.close();
      expect(server.requests.filter((request) => request.method === "DELETE")).toHaveLength(1);

      const gone = answering((init) =>
        init?.method === "DELETE"
          ? new Response(null, { status: 404 })
          : Response.json({}, { headers: { "mcp-session-id": "session-2" } }),
      );
      const ended = transportFor(gone);
      await collect(ended.send({ jsonrpc: "2.0", id: 1, method: "initialize" }));
      await expect(ended.close()).resolves.toBeUndefined();
    });
  });

  describe("refusals", () => {
    it("maps an error status to our error and never reads the server's text", async () => {
      const refused = answering(() => new Response("the key sk-acme is wrong", { status: 401 }));
      const failure = collect(transportFor(refused).send(listTools));
      await expect(failure).rejects.toMatchObject({ code: "not-signed-in" });
      await expect(failure).rejects.not.toThrow(/sk-acme/);
    });

    it("says the session expired on a 404 once the server gave a session", async () => {
      const server = answering((init) => {
        const body = JSON.parse(String(init?.body)) as { method: string };
        if (body.method === "initialize") {
          return Response.json({}, { headers: { "mcp-session-id": "session-1" } });
        }
        return new Response(null, { status: 404 });
      });
      const transport = transportFor(server);
      await collect(transport.send({ jsonrpc: "2.0", id: 1, method: "initialize" }));
      await expect(collect(transport.send(listTools))).rejects.toMatchObject({
        code: "session-expired",
      });
    });

    it("refuses a session id with characters a header can't carry", async () => {
      const server = answering(() => Response.json({}, { headers: { "mcp-session-id": "a b" } }));
      const initialize = { jsonrpc: "2.0" as const, id: 1, method: "initialize" };
      await expect(collect(transportFor(server).send(initialize))).rejects.toMatchObject({
        code: "unexpected-response",
      });
    });

    const typed = (text: string, type: string) =>
      new Response(text, { headers: { "content-type": type } });

    /** Text that stands for the server's own words: no error may repeat it. */
    const serverText = "sk-acme-secret";
    const overLimit = `${serverText} ${"x".repeat(5000)}`;

    it.each([
      ["a JSON answer over the limit", () => Response.json({ text: overLimit })],
      ["an event over the limit", () => eventStreamResponse([{ text: overLimit }])],
      ["an unended line over the limit", () => typed(`data: ${overLimit}`, "text/event-stream")],
      ["an answer that isn't JSON", () => typed(`<html>${serverText}`, "application/json")],
      ["an answer of another type", () => typed(serverText, "text/plain")],
    ])("refuses %s without the server's text", async (_name, answer) => {
      const failure = collect(transportFor(answering(answer)).send(listTools));
      await expect(failure).rejects.toMatchObject({ code: "unexpected-response" });
      await expect(failure).rejects.not.toThrow(serverText);
    });
  });

  describe("time limits", () => {
    /** A server that never answers, until the request is aborted. */
    const silent = answering(
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    it("fails a request the server doesn't answer within the request timeout", async () => {
      vi.useFakeTimers();
      const failure = collect(transportFor(silent).send(listTools));
      const checked = expect(failure).rejects.toThrow(
        "The MCP server didn't answer tools/list within 5 seconds.",
      );
      await vi.advanceTimersByTimeAsync(5000);
      await checked;
    });

    it("fails a request the caller cancels", async () => {
      const controller = new AbortController();
      const failure = collect(transportFor(silent).send(listTools, controller.signal));
      controller.abort();
      await expect(failure).rejects.toThrow("The request was cancelled.");
    });
  });
});
