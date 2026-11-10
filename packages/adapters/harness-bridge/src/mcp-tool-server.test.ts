import type {
  BridgeApprovalDecision,
  BridgeApprovalRequest,
  BridgeEvent,
  BridgeToolCheck,
  BridgeToolResult,
  BridgeTools,
  ToolDefinition,
} from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { HalonicTools } from "./halonic-tools.ts";
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
  /** How a person answers a call that needs an OK; approves it unless given. */
  decide?: (request: BridgeApprovalRequest) => Promise<BridgeApprovalDecision>;
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
  const asked: BridgeApprovalRequest[] = [];
  const approvals = {
    request: async (request: BridgeApprovalRequest) => {
      asked.push(request);
      return fake.decide?.(request) ?? { approved: true };
    },
  };
  const server = new McpToolServer(
    new HalonicTools({ agent: "writer", tools, recorder, approvals }),
  );
  const ask = (message: unknown) =>
    server.answerBytes(encodeUtf8(JSON.stringify(message)), {
      signal: new AbortController().signal,
    });
  return { server, ask, recorded, ran, asked };
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

verifies("harness-bridge.approvals", () => {
  describe("tools/call that needs a person's OK", () => {
    const needsOk = { check: (): BridgeToolCheck => ({ kind: "ask" }) };

    it("asks with the tool and its arguments, then runs and records an approved call", async () => {
      const { ask, asked, ran, recorded } = serverWith(needsOk);
      const reply = await ask(callTool("post_comment", { body: "hi" }));
      expect(asked).toEqual([
        { callId: expect.stringMatching(/^bridge-/), tool: "post_comment", args: { body: "hi" } },
      ]);
      expect(ran).toEqual(["post_comment"]);
      expect(reply).toMatchObject({ result: { content: [{ text: "ran post_comment" }] } });
      expect(recorded.map((event) => event.type)).toEqual(["tool.called", "tool.result"]);
    });

    it("gives every question its own call id", async () => {
      const { ask, asked } = serverWith(needsOk);
      await ask(callTool("post_comment"));
      await ask(callTool("post_comment"));
      expect(new Set(asked.map((request) => request.callId)).size).toBe(2);
    });

    it.each([
      [undefined, "Refused: a person rejected the call"],
      ["", "Refused: a person rejected the call"],
      ["not on Fridays", "Refused: a person rejected the call and wrote: not on Fridays"],
    ])("doesn't run or record a rejected call (comment %j)", async (comment, text) => {
      const { ask, ran, recorded } = serverWith({
        ...needsOk,
        decide: async () => ({ approved: false, ...(comment === undefined ? {} : { comment }) }),
      });
      const reply = await ask(callTool("post_comment", { body: "hi" }));
      expect(reply).toMatchObject({ result: { content: [{ text }], isError: true } });
      expect(ran).toEqual([]);
      expect(recorded).toEqual([]);
    });

    it("doesn't run a call whose wait ended, and hides why it ended", async () => {
      const { ask, ran, recorded } = serverWith({
        ...needsOk,
        decide: () => Promise.reject(new Error("run_1 was cancelled at /secret")),
      });
      const reply = await ask(callTool("post_comment"));
      expect(reply).toMatchObject({
        result: {
          content: [{ text: "Refused: the wait for a person's OK ended without an answer" }],
          isError: true,
        },
      });
      expect(JSON.stringify(reply)).not.toContain("/secret");
      expect(ran).toEqual([]);
      expect(recorded).toEqual([]);
    });

    it("never asks about a call the check lets run or refuses", async () => {
      const allowed = serverWith();
      await allowed.ask(callTool("read_issue"));
      const refused = serverWith({ check: () => ({ kind: "refused", reason: "off" }) });
      await refused.ask(callTool("read_issue"));
      expect([...allowed.asked, ...refused.asked]).toEqual([]);
    });
  });
});
