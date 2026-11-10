import type {
  BridgeEvent,
  BridgeToolCheck,
  BridgeToolResult,
  BridgeTools,
  ToolDefinition,
} from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { rpcErrorCodes } from "./json-rpc.ts";
import { McpToolServer } from "./mcp-tool-server.ts";

const readIssue: ToolDefinition = {
  name: "read_issue",
  description: "Reads one issue.",
  parameters: { type: "object", properties: { number: { type: "integer" } } },
};

const postComment: ToolDefinition = {
  name: "post_comment",
  description: "Posts a comment.",
  // No `type`, as some tools give it: the bridge adds it for MCP.
  parameters: { properties: { body: { type: "string" } } },
};

/** What the fake tools answer; each part left out works as a plain tool would. */
interface FakeTools {
  check?: (name: string) => BridgeToolCheck;
  call?: (name: string, args: Record<string, unknown>) => Promise<BridgeToolResult>;
  list?: () => Promise<ToolDefinition[]>;
}

/** A server over fake tools, with the events it records and the calls that ran. */
function serverWith(fake: FakeTools = {}) {
  const recorded: BridgeEvent[] = [];
  const ran: string[] = [];
  const tools: BridgeTools = {
    list: fake.list ?? (async () => [readIssue, postComment]),
    check: async (name) => fake.check?.(name) ?? { kind: "run" },
    call: async (name, args) => {
      ran.push(name);
      return fake.call?.(name, args) ?? { result: `ran ${name}`, outcome: "ok" };
    },
  };
  const recorder = { record: async (event: BridgeEvent) => void recorded.push(event) };
  const server = new McpToolServer({ agent: "writer", tools, recorder });
  const ask = (message: unknown) =>
    server.answerBytes(encodeUtf8(JSON.stringify(message)), {
      signal: new AbortController().signal,
    });
  return { server, ask, recorded, ran };
}

function request(method: string, params?: Record<string, unknown>) {
  return { jsonrpc: "2.0", id: 1, method, ...(params === undefined ? {} : { params }) };
}

function callTool(name: unknown, args?: unknown) {
  return request("tools/call", { name, ...(args === undefined ? {} : { arguments: args }) });
}

verifies("harness-bridge.mcp", () => {
  describe("the session", () => {
    it.each([
      ["2025-06-18", "2025-06-18"],
      ["2025-03-26", "2025-03-26"],
      ["1999-01-01", "2025-11-25"],
    ])("answers initialize for version %s with %s", async (asked, answered) => {
      const { ask } = serverWith();
      const reply = await ask(request("initialize", { protocolVersion: asked }));
      expect(reply).toMatchObject({
        id: 1,
        result: { protocolVersion: answered, capabilities: { tools: {} } },
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
      expect(reply).toMatchObject({ error: { code: rpcErrorCodes.methodNotFound } });
    });

    it("answers a body that isn't JSON with a parse error", async () => {
      const { server } = serverWith();
      const reply = await server.answerBytes(encodeUtf8("{"), {
        signal: new AbortController().signal,
      });
      expect(reply).toMatchObject({ id: null, error: { code: rpcErrorCodes.parseError } });
    });
  });

  describe("tools/list", () => {
    it("lists the offered tools in order, each with an object schema", async () => {
      const { ask } = serverWith();
      expect(await ask(request("tools/list"))).toMatchObject({
        result: {
          tools: [
            {
              name: "read_issue",
              description: "Reads one issue.",
              inputSchema: readIssue.parameters,
            },
            {
              name: "post_comment",
              inputSchema: { type: "object", properties: postComment.parameters["properties"] },
            },
          ],
        },
      });
    });

    it("hides why listing failed", async () => {
      const { ask } = serverWith({
        list: () => Promise.reject(new Error("store at /secret broke")),
      });
      const reply = await ask(request("tools/list"));
      expect(reply).toMatchObject({ error: { code: rpcErrorCodes.internalError } });
      expect(JSON.stringify(reply)).not.toContain("/secret");
    });
  });

  describe("tools/call", () => {
    it("runs an allowed call and records it before and after", async () => {
      const { ask, recorded } = serverWith();
      const reply = await ask(callTool("read_issue", { number: 3 }));
      expect(reply).toMatchObject({
        result: { content: [{ type: "text", text: "ran read_issue" }], isError: false },
      });
      expect(recorded).toEqual([
        { type: "tool.called", agent: "writer", tool: "read_issue", args: { number: 3 } },
        {
          type: "tool.result",
          agent: "writer",
          tool: "read_issue",
          result: "ran read_issue",
          outcome: "ok",
        },
      ]);
    });

    it("gives a failed tool's result as an error result", async () => {
      const { ask, recorded } = serverWith({
        call: async () => ({ result: "no such issue", outcome: "error" }),
      });
      const reply = await ask(callTool("read_issue", {}));
      expect(reply).toMatchObject({
        result: { content: [{ text: "no such issue" }], isError: true },
      });
      expect(recorded.at(-1)).toMatchObject({ type: "tool.result", outcome: "error" });
    });

    it("records a call that breaks off as unknown", async () => {
      const { ask, recorded } = serverWith({ call: () => Promise.reject(new Error("aborted")) });
      const reply = await ask(callTool("read_issue"));
      expect(reply).toMatchObject({ result: { isError: true } });
      expect(recorded.at(-1)).toMatchObject({ type: "tool.result", outcome: "unknown" });
    });

    it("doesn't run or record a refused call, and gives the reason", async () => {
      const { ask, recorded, ran } = serverWith({
        check: () => ({ kind: "refused", reason: "sending is off for GitHub" }),
      });
      const reply = await ask(callTool("post_comment", { body: "hi" }));
      expect(reply).toMatchObject({
        result: { content: [{ text: "Refused: sending is off for GitHub" }], isError: true },
      });
      expect(ran).toEqual([]);
      expect(recorded).toEqual([]);
    });

    it("refuses a call that needs a person's OK, until the bridge can ask", async () => {
      const { ask, recorded, ran } = serverWith({ check: () => ({ kind: "ask" }) });
      const reply = await ask(callTool("post_comment", { body: "hi" }));
      expect(reply).toMatchObject({ result: { isError: true } });
      expect(ran).toEqual([]);
      expect(recorded).toEqual([]);
    });

    it.each([
      ["no name", callTool(undefined)],
      ["arguments that aren't an object", callTool("read_issue", "3")],
    ])("refuses a call with %s as invalid params", async (_name, message) => {
      const { ask, ran } = serverWith();
      expect(await ask(message)).toMatchObject({ error: { code: rpcErrorCodes.invalidParams } });
      expect(ran).toEqual([]);
    });
  });
});
