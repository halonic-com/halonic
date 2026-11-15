import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { DecideInput } from "../../kernel/decide-types.ts";
import { answer, play } from "../../kernel/kernel-test-kit.test-helper.ts";
import { researchWorkflow, start } from "./parallel-test-kit.test-helper.ts";

verifies("engine.parallel-state", () => {
  it("fails the run with the agent and pin of the first branch whose instructions weren't trusted", () => {
    const pin = { digest: "sha256:b", files: { "AGENTS.md": "sha256:a" } };
    const error =
      "Halonic didn't start agent \"searcher\": a person hasn't trusted its instructions yet. Trust the instructions, then run again.";
    const untrusted: DecideInput = {
      type: "effect-failed",
      at: "2026-11-09T09:00:05.000Z",
      callId: "call-2",
      error,
      reason: "instructions-not-trusted",
      agent: "searcher",
      refusal: { pin, changed: true },
    };
    const { decisions, run } = play(researchWorkflow(), [start, untrusted, answer("call-1", "n")]);
    expect(decisions[2]?.events.at(-1)).toEqual({
      type: "run.failed",
      state: "research",
      error: `Branch "web" of parallel state "research" failed: ${error}`,
      reason: "instructions-not-trusted",
      agent: "searcher",
      pin,
      changed: true,
    });
    expect(run?.status).toBe("failed");
  });
});
