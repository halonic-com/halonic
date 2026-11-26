import { verifies } from "@halonicjs/testing-spec";
import type { ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import { type ReactToolApi, registerReactTool } from "./react-tool.ts";
import {
  agentReply,
  boardMessage,
  chatTask,
  fakeReactionContext,
} from "./reactions.test-helper.ts";
import { taskReactions } from "./reactions.ts";

type Handler = (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>;

const runCtx: ToolRunContext = {
  agentId: "agent-elena",
  runId: "run-1",
  companyId: chatTask.companyId,
  projectId: "",
};

/** `react` on the fake chat task, with the store it writes to. */
function setUp() {
  const base = fakeReactionContext();
  let handler: Handler | undefined;
  const ctx = {
    ...base,
    tools: { register: (_name: string, _declaration: unknown, fn: Handler) => (handler = fn) },
    metrics: { write: async () => undefined },
  } as unknown as ReactToolApi;
  registerReactTool(ctx);
  const react = (params: unknown) => {
    if (handler === undefined) throw new Error("react isn't registered");
    return handler(params, runCtx);
  };
  const stored = () => taskReactions(base.state, chatTask.companyId, chatTask.id);
  return { react, stored, saved: base.saved };
}

verifies("paperclip.agent-react-tool", () => {
  test("an agent's new reaction replaces its earlier one on the person's message", async () => {
    const { react, stored } = setUp();
    await react({ task: "HAL-9001", comment: boardMessage.id, emoji: "👀" });
    const result = await react({ task: "HAL-9001", comment: boardMessage.id, emoji: "👍" });
    expect(result.data).toEqual({ task: "HAL-9001", commentId: boardMessage.id, emoji: "👍" });
    const reactions = (await stored())[boardMessage.id] ?? [];
    expect(reactions.map(({ emoji, by }) => ({ emoji, by }))).toEqual([
      { emoji: "👍", by: { kind: "agent", id: "agent-elena" } },
    ]);
  });

  test("refuses an agent's message, a message not on the task and any other emoji, storing nothing", async () => {
    const { react, saved } = setUp();
    expect(await react({ task: "HAL-9001", comment: agentReply.id, emoji: "👍" })).toEqual({
      error: "react: react only to a person's message, never to an agent's.",
    });
    const elsewhere = "9d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a";
    expect(await react({ task: "HAL-9001", comment: elsewhere, emoji: "👍" })).toEqual({
      error: `react: no comment ${elsewhere} on HAL-9001.`,
    });
    expect(await react({ task: "HAL-9001", comment: boardMessage.id, emoji: "❤️" })).toEqual({
      error: "react: emoji must be 👍 or 👀.",
    });
    expect(saved.size).toBe(0);
  });
});
