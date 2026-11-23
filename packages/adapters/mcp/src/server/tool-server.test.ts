import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { rpcErrorCodes } from "./json-rpc.ts";
import { McpToolServer } from "./tool-server.ts";
import type { McpTool, McpToolCallResult, McpToolSet } from "./tool-set.ts";

const searchNotes: McpTool = {
  name: "search_notes",
  description: "Searches the notes.",
  inputSchema: { type: "object", properties: { query: { type: "string" } } },
};

const addNote: McpTool = {
  name: "add_note",
  description: "Adds a note.",
  inputSchema: { type: "object", properties: { text: { type: "string" } } },
};

/** What the fake set answers; each part left out works as a plain tool would. */
interface FakeSet {
  list?: () => Promise<McpTool[]>;
  call?: (name: string, args: Record<string, unknown>) => Promise<McpToolCallResult>;
}

/** A server over a fake tool set, with the calls that reached the set and the errors it reported. */
function serverWith(fake: FakeSet = {}) {
  const called: { name: string; args: Record<string, unknown> }[] = [];
  const reported: unknown[] = [];
  const tools: McpToolSet = {
    list: fake.list ?? (async () => [searchNotes, addNote]),
    call: async (name, args) => {
      called.push({ name, args });
      return fake.call?.(name, args) ?? { text: `ran ${name}`, isError: false };
    },
  };
  const server = new McpToolServer(tools, { reportError: (error) => reported.push(error) });
  const ask = (message: unknown) => answerText(server, JSON.stringify(message));
  return { server, ask, called, reported };
}

function answerText(server: McpToolServer, text: string) {
  return server.answerBytes(encodeUtf8(text), { signal: new AbortController().signal });
}

function request(method: string, params?: Record<string, unknown>) {
  return { jsonrpc: "2.0", id: 1, method, ...(params === undefined ? {} : { params }) };
}

function callTool(name: unknown, args?: unknown) {
  return request("tools/call", { name, ...(args === undefined ? {} : { arguments: args }) });
}

verifies("mcp.tool-server", () => {
  describe("the session", () => {
    it.each([
      ["2025-11-25", "2025-11-25"],
      ["2025-06-18", "2025-06-18"],
      ["2025-03-26", "2025-03-26"],
      ["1999-01-01", "2025-11-25"],
      [undefined, "2025-11-25"],
    ])("answers initialize for version %s with %s", async (asked, answered) => {
      const { ask } = serverWith();
      const reply = await ask(request("initialize", { protocolVersion: asked }));
      expect(reply).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        result: { protocolVersion: answered, capabilities: { tools: { listChanged: false } } },
      });
    });

    it("answers ping, and no notification or response", async () => {
      const { ask } = serverWith();
      expect(await ask(request("ping"))).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
      expect(await ask({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
      expect(await ask({ jsonrpc: "2.0", id: 9, result: {} })).toBeNull();
    });

    it("doesn't serve another method", async () => {
      const { ask } = serverWith();
      const reply = await ask(request("resources/list"));
      expect(reply).toMatchObject({ id: 1, error: { code: rpcErrorCodes.methodNotFound } });
    });

    it("answers a body that isn't JSON with a parse error", async () => {
      const { server } = serverWith();
      const reply = await answerText(server, "{");
      expect(reply).toMatchObject({ id: null, error: { code: rpcErrorCodes.parseError } });
    });

    it("answers a batch and a message that isn't JSON-RPC as invalid requests", async () => {
      const { ask } = serverWith();
      const batch = await ask([request("ping")]);
      const other = await ask({ jsonrpc: "1.0", id: 1, method: "ping" });
      expect(batch).toMatchObject({ id: null, error: { code: rpcErrorCodes.invalidRequest } });
      expect(other).toMatchObject({ id: null, error: { code: rpcErrorCodes.invalidRequest } });
    });
  });

  describe("tools/list", () => {
    it("lists the set's tools in order", async () => {
      const { ask } = serverWith();
      expect(await ask(request("tools/list"))).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: { tools: [searchNotes, addNote] },
      });
    });

    it("hides why listing failed, and reports it", async () => {
      const failure = new Error("store at /secret broke");
      const { ask, reported } = serverWith({ list: () => Promise.reject(failure) });
      const reply = await ask(request("tools/list"));
      expect(reply).toMatchObject({ id: 1, error: { code: rpcErrorCodes.internalError } });
      expect(JSON.stringify(reply)).not.toContain("/secret");
      expect(reported).toEqual([failure]);
    });
  });

  describe("tools/call", () => {
    it("gives the set's answer as one text content", async () => {
      const { ask, called } = serverWith();
      const reply = await ask(callTool("search_notes", { query: "invoices" }));
      expect(reply).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: { content: [{ type: "text", text: "ran search_notes" }], isError: false },
      });
      expect(called).toEqual([{ name: "search_notes", args: { query: "invoices" } }]);
    });

    it("calls with empty arguments when the client sends none", async () => {
      const { ask, called } = serverWith();
      await ask(callTool("search_notes"));
      expect(called).toEqual([{ name: "search_notes", args: {} }]);
    });

    it("keeps the set's error flag", async () => {
      const { ask, reported } = serverWith({
        call: async () => ({ text: "no such note", isError: true }),
      });
      const reply = await ask(callTool("add_note", {}));
      expect(reply).toMatchObject({
        result: { content: [{ type: "text", text: "no such note" }], isError: true },
      });
      expect(reported).toEqual([]);
    });

    it("hides why a call failed, and reports it", async () => {
      const failure = new Error("store at /secret broke");
      const { ask, reported } = serverWith({ call: () => Promise.reject(failure) });
      const reply = await ask(callTool("add_note", { text: "hi" }));
      expect(reply).toMatchObject({ id: 1, error: { code: rpcErrorCodes.internalError } });
      expect(JSON.stringify(reply)).not.toContain("/secret");
      expect(reported).toEqual([failure]);
    });

    it.each([
      ["no name", callTool(undefined)],
      ["arguments that aren't an object", callTool("add_note", "hi")],
    ])("refuses a call with %s as invalid params", async (_name, message) => {
      const { ask, called } = serverWith();
      expect(await ask(message)).toMatchObject({ error: { code: rpcErrorCodes.invalidParams } });
      expect(called).toEqual([]);
    });
  });

  it("passes the caller's signal to the set", async () => {
    const signals: AbortSignal[] = [];
    const server = new McpToolServer(
      {
        list: async () => [],
        call: async (_name, _args, signal) => {
          signals.push(signal);
          return { text: "", isError: false };
        },
      },
      { reportError: () => undefined },
    );
    const controller = new AbortController();
    await server.answerBytes(encodeUtf8(JSON.stringify(callTool("add_note"))), {
      signal: controller.signal,
    });
    expect(signals).toEqual([controller.signal]);
  });
});
