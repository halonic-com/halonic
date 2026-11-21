import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import { answerChoicesOf, answerNotAnOptionCause } from "./answer-choices.ts";
import type { RunFailureCause } from "./run-basics.ts";
import type { RunEventBody } from "./run-event.ts";

/** A cause with the code `answerNotAnOptionCause` writes and this `detail`. */
function withDetail(detail: Record<string, string>): RunFailureCause {
  return { kind: "invalid_input", code: "agent.answer-not-an-option", detail };
}

verifies("events.answer-choices", () => {
  it("names the agent and the choices, as one JSON array", () => {
    expect(
      answerNotAnOptionCause({ agent: "sorter", options: ["refund", "question", "spam"] }),
    ).toEqual({
      kind: "invalid_input",
      code: "agent.answer-not-an-option",
      detail: { agent: "sorter", options: '["refund","question","spam"]' },
    });
  });

  it("reads the agent and the choices back in their order", () => {
    const cause = answerNotAnOptionCause({
      agent: "sorter",
      options: ["refund", "question", "spam"],
    });
    expect(answerChoicesOf(cause)).toEqual({
      agent: "sorter",
      options: ["refund", "question", "spam"],
    });
  });

  it("keeps a choice with a comma or a quote as it was", () => {
    const cause = answerNotAnOptionCause({ agent: "sorter", options: ['yes, "now"', "later"] });
    expect(answerChoicesOf(cause)?.options).toEqual(['yes, "now"', "later"]);
  });

  it("gives nothing for any other cause, or one it can't read", () => {
    expect(answerChoicesOf(undefined)).toBeUndefined();
    expect(answerChoicesOf({ kind: "internal" })).toBeUndefined();
    expect(
      answerChoicesOf({
        kind: "invalid_input",
        code: "other",
        detail: { agent: "a", options: '["x"]' },
      }),
    ).toBeUndefined();
    expect(answerChoicesOf(withDetail({ agent: "", options: '["x"]' }))).toBeUndefined();
    expect(answerChoicesOf(withDetail({ agent: "sorter" }))).toBeUndefined();
    expect(answerChoicesOf(withDetail({ agent: "sorter", options: "refund" }))).toBeUndefined();
    expect(answerChoicesOf(withDetail({ agent: "sorter", options: "[]" }))).toBeUndefined();
    expect(answerChoicesOf(withDetail({ agent: "sorter", options: "[1, 2]" }))).toBeUndefined();
    expect(answerChoicesOf(withDetail({ agent: "sorter", options: '{"a":"b"}' }))).toBeUndefined();
  });

  typeTest("lets an agent.finished event carry the cause", () => {
    type Finished = Extract<RunEventBody, { type: "agent.finished" }>;
    expectTypeOf<Finished["cause"]>().toEqualTypeOf<RunFailureCause | undefined>();
  });
});
