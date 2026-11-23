import type { Agent, Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { DecideInput } from "../../kernel/decide-types.ts";
import { play, startInput, writerAgent } from "../../kernel/kernel-test-kit.test-helper.ts";

const planning: Workflow = {
  version: 1,
  id: "plan",
  name: "Plan a change",
  initial: "plan",
  context: {},
  states: {
    plan: {
      type: "task",
      agent: "planner",
      input: "Plan the change.",
      output: "plan",
      on: [{ to: "planned", event: "done" }],
    },
    planned: { type: "final", on: [] },
  },
  layout: {},
};

const start = { ...startInput("sha-1"), workflowId: "plan" };

function planner(answerRetries?: number): Agent {
  return {
    ...writerAgent(),
    id: "planner",
    name: "Planner",
    output: { type: "json" },
    ...(answerRetries === undefined ? {} : { answerRetries }),
  };
}

const answer = (output: string): DecideInput => ({
  type: "effect-done",
  at: "2026-11-09T09:00:05.000Z",
  callId: "call-1",
  result: { type: "model", output },
});

const fence = (tag: string, body: string) => `\`\`\`${tag}\n${body}\n\`\`\``;

verifies("engine.task-answer-json-found", () => {
  it.each([
    ["prose before a json fence", `Here is the plan:\n\n${fence("json", '{"steps": 2}')}`],
    ["an untagged fence between prose", `Plan:\n${fence("", '{"steps": 2}')}\nDone.`],
    ["one object in prose", 'The plan is {"steps": 2}, as asked.'],
    ["one object after a ts fence", `${fence("ts", "const a = 1;")}\nSo: {"steps": 2}`],
    ["braces inside the object's strings", 'Result: {"steps": 2, "note": "a } b {"} ok'],
  ])("takes the JSON from %s, without asking again", (_case, text) => {
    const { log, run } = play(planning, [start, answer(text)], { planner: planner(1) });
    expect(run?.status).toBe("completed");
    expect(run?.context["plan"]).toMatchObject({ steps: 2 });
    expect(log.some((event) => event.type === "agent.answer-retried")).toBe(false);
  });

  it.each([
    ["prose only", "I would change the parser first."],
    ["two json fences", `${fence("json", '{"a": 1}')}\nor\n${fence("json", '{"b": 2}')}`],
    ["two objects in prose", 'Either {"a": 1} or {"b": 2}.'],
    ["one fence that doesn't parse", `Plan:\n${fence("json", "{steps: 2}")}`],
    ["an object cut off", 'Plan: {"steps": 2, "files": ["a.ts"'],
  ])("asks again after %s", (_case, text) => {
    const { log, run } = play(planning, [start, answer(text)], { planner: planner(1) });
    expect(log.at(-1)).toMatchObject({ type: "agent.answer-retried", rejected: { answer: text } });
    expect(run?.status).toBe("running");
  });

  it("doesn't look for the JSON without answerRetries", () => {
    const text = `Here is the plan:\n\n${fence("json", '{"steps": 2}')}`;
    const { log } = play(planning, [start, answer(text)], { planner: planner() });
    expect(log.at(-1)).toMatchObject({
      type: "run.failed",
      cause: { code: "answer.not-json" },
    });
  });
});
