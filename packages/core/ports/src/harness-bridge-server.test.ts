import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { HarnessBridge } from "./harness.ts";
import {
  type BridgeEvent,
  type BridgeProviderAccess,
  type BridgeTools,
  bridgeCallCost,
  type HarnessBridgeOptions,
  type HarnessBridgeServer,
  type OpenHarnessBridge,
} from "./harness-bridge-server.ts";

/** What the test bridge's one MCP call needs: a tool name and its arguments. */
interface ToolCallRequest {
  name: string;
  args: Record<string, unknown>;
}

/**
 * A bridge cut down to one MCP `tools/call`, with no server: it checks the
 * call, asks a person when the check says so, runs it and records it. That is
 * the order the real bridge follows.
 */
function fakeBridgeServer(): HarnessBridgeServer & {
  callTool(request: ToolCallRequest): Promise<string>;
} {
  let options: HarnessBridgeOptions | undefined;
  const signal = new AbortController().signal;

  async function callTool(request: ToolCallRequest): Promise<string> {
    if (options === undefined) throw new Error("the bridge isn't open");
    const check = await options.tools.check(request.name, request.args);
    if (check.kind === "refused") return `Refused: ${check.reason}`;
    if (check.kind === "ask") {
      const callId = "call_1";
      const decision = await options.approvals.request(
        { callId, tool: request.name, args: request.args },
        { signal },
      );
      if (!decision.approved) return "Not approved";
    }
    const agent = options.agentId;
    await options.recorder.record({
      type: "tool.called",
      agent,
      tool: request.name,
      args: request.args,
    });
    const ran = await options.tools.call(request.name, request.args, { signal });
    await options.recorder.record({ type: "tool.result", agent, tool: request.name, ...ran });
    return ran.result;
  }

  return {
    open: async (given) => {
      options = given;
      return { url: "http://127.0.0.1:41817", token: "not-a-real-token", close: async () => {} };
    },
    callTool,
  };
}

const sendMail: BridgeTools = {
  list: async () => [{ name: "gmail_send", description: "Sends a mail.", parameters: {} }],
  check: async (name) =>
    name === "gmail_send" ? { kind: "ask" } : { kind: "refused", reason: "not offered" },
  call: async () => ({ result: "sent", outcome: "ok" }),
};

verifies("ports.harness-bridge-server", () => {
  it("opens a bridge with the engine's parts and runs an approved call", async () => {
    const recorded: BridgeEvent[] = [];
    const asked: string[] = [];
    const server = fakeBridgeServer();
    const bridge = await server.open({
      runId: "run_1",
      agentId: "writer",
      providers: { anthropic: { kind: "key", secret: "anthropic-key" } },
      price: () => ({ input: 3, output: 15 }),
      recorder: { record: async (event) => void recorded.push(event) },
      tools: sendMail,
      approvals: {
        request: async (request) => {
          asked.push(request.tool);
          return { approved: true };
        },
      },
    });

    expect(await server.callTool({ name: "gmail_send", args: { to: "team@acme.example" } })).toBe(
      "sent",
    );
    expect(asked).toEqual(["gmail_send"]);
    expect(recorded.map((event) => event.type)).toEqual(["tool.called", "tool.result"]);
    await bridge.close();
  });

  typeTest("gives the engine a bridge it can hand to a harness, and close", () => {
    expectTypeOf<OpenHarnessBridge>().toExtend<HarnessBridge>();
    expectTypeOf<OpenHarnessBridge["close"]>().returns.toEqualTypeOf<Promise<void>>();
  });

  it("records only model calls and Halonic tool calls", () => {
    const response: BridgeEvent = {
      type: "llm.response",
      agent: "writer",
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      usage: { inputTokens: 120, outputTokens: 30 },
      latencyMs: 900,
      text: "",
      cost: 0.00081,
    };
    // @ts-expect-error: the harness reports how the agent ended, not the bridge
    const finished: BridgeEvent = { type: "agent.finished", agent: "writer", output: "done" };
    expect([response, finished]).toHaveLength(2);
  });

  it("names no secret for a subscription", () => {
    const subscription: BridgeProviderAccess = { kind: "sign-in" };
    // @ts-expect-error: the person's own sign-in is passed on, never looked up
    const withSecret: BridgeProviderAccess = { kind: "sign-in", secret: "anthropic-key" };
    expect([subscription, withSecret]).toHaveLength(2);
  });

  it("records a subscription call at no cost, and a keyed call without a price as unpriced", () => {
    const usage = { inputTokens: 1_000, outputTokens: 200 };
    const anthropicKey: BridgeProviderAccess = { kind: "key", secret: "anthropic-key" };
    expect(bridgeCallCost({ kind: "sign-in" }, null, usage)).toBe(0);
    expect(bridgeCallCost({ kind: "sign-in" }, { input: 3, output: 15 }, usage)).toBe(0);
    expect(bridgeCallCost(anthropicKey, null, usage)).toBeUndefined();
  });

  it("prices a keyed call per million tokens", () => {
    const usage = { inputTokens: 1_000, outputTokens: 200 };
    const anthropicKey: BridgeProviderAccess = { kind: "key", secret: "anthropic-key" };
    expect(bridgeCallCost(anthropicKey, { input: 3, output: 15 }, usage)).toBe(0.006);
  });
});
