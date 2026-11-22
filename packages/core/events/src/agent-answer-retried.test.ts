import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { RunFailureCause, RunFailureReason } from "./run-basics.ts";
import type { RunEventBody } from "./run-event.ts";
import { summaryOf } from "./summarize.test-helper.ts";

type AnswerRetried = Extract<RunEventBody, { type: "agent.answer-retried" }>;

const retried: AnswerRetried = {
  type: "agent.answer-retried",
  state: "plan",
  agent: "planner",
  reason: "error",
  cause: { kind: "invalid_input", code: "answer.not-json", detail: { agent: "planner" } },
  error: 'Agent "planner" answered "sure", which isn\'t the JSON its output asks for.',
  attempt: 1,
  prompt: "Plan the change.\n\nYour answer can't be used: …",
};

verifies("events.agent-answer-retried", () => {
  typeTest("names the step, why the answer was unusable, the attempt and the new prompt", () => {
    expectTypeOf<AnswerRetried>().toEqualTypeOf<{
      type: "agent.answer-retried";
      state: string;
      agent: string;
      reason: RunFailureReason;
      cause?: RunFailureCause;
      error: string;
      attempt: number;
      prompt: string;
    }>();
  });

  it("changes nothing the run's summary holds: no spend, still running", () => {
    const summary = summaryOf(retried);
    expect(summary.cost).toBe(0);
    expect(summary.usage).toStrictEqual({ inputTokens: 0, outputTokens: 0 });
    expect(summary.status).toBe("running");
  });
});
