import type { WorkflowState } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  answer,
  play,
  replyWorkflow,
  startInput,
  writerAgent,
} from "../../kernel/kernel-test-kit.test-helper.ts";

/** {@link replyWorkflow} whose `draft` state keeps its turns under `chat`, with `chat` set to `kept` first. */
function chatWorkflow(kept?: unknown, extra: Partial<WorkflowState> = {}) {
  const draft = {
    ...replyWorkflow.states["draft"],
    conversation: "chat",
    ...extra,
  } as WorkflowState;
  return {
    ...replyWorkflow,
    context: kept === undefined ? {} : { chat: kept },
    states: { ...replyWorkflow.states, draft },
  };
}

const earlier = [
  { role: "user", content: "Reply to sales" },
  { role: "assistant", content: "Hello, sales." },
];

verifies("engine.task-conversation", () => {
  it("keeps the prompt and the answer under the conversation key, after the output and the signal", () => {
    const signal = { name: "reply.sent", data: {} };
    const { decisions, run } = play(chatWorkflow(undefined, { signal }), [
      startInput("sha-1"),
      answer("call-1", "Hello, support."),
    ]);
    const turns = [
      { role: "user", content: "Reply to support" },
      { role: "assistant", content: "Hello, support." },
    ];
    expect(decisions[1]?.events.slice(1, 4)).toEqual([
      { type: "context.updated", key: "reply", value: "Hello, support." },
      { type: "signal.sent", state: "draft", name: "reply.sent", data: {} },
      { type: "context.updated", key: "chat", value: turns },
    ]);
    expect(run?.context["chat"]).toEqual(turns);
  });

  it("adds the turn after the ones kept so far", () => {
    const { run } = play(chatWorkflow(earlier), [startInput("sha-1"), answer("call-1", "Hi.")]);
    expect(run?.context["chat"]).toEqual([
      ...earlier,
      { role: "user", content: "Reply to support" },
      { role: "assistant", content: "Hi." },
    ]);
  });

  it("drops what under the key isn't a turn", () => {
    const mixed = [earlier[0], { role: "system", content: "x" }, { role: "user" }, "text", null];
    const notAList = play(chatWorkflow("not turns"), [
      startInput("sha-1"),
      answer("call-1", "Hi."),
    ]);
    const someTurns = play(chatWorkflow(mixed), [startInput("sha-1"), answer("call-1", "Hi.")]);
    expect(notAList.run?.context["chat"]).toHaveLength(2);
    expect(someTurns.run?.context["chat"]).toEqual([
      earlier[0],
      { role: "user", content: "Reply to support" },
      { role: "assistant", content: "Hi." },
    ]);
  });

  it("keeps an answer that is data as JSON", () => {
    const writer = { ...writerAgent(), output: { type: "json" as const } };
    const { run } = play(chatWorkflow(), [startInput("sha-1"), answer("call-1", '{"ok": true}')], {
      writer,
    });
    expect(run?.context["chat"]).toEqual([
      { role: "user", content: "Reply to support" },
      { role: "assistant", content: '{"ok":true}' },
    ]);
  });

  it("writes nothing for a state without a conversation", () => {
    const { run } = play(replyWorkflow, [startInput("sha-1"), answer("call-1", "Hi.")]);
    expect(Object.keys(run?.context ?? {})).toEqual(["reply"]);
  });
});
