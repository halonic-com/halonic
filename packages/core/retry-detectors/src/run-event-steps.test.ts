import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { AttemptStepRecorder } from "./run-event-steps.ts";

verifies("retry-detectors.early-hedge", () => {
  describe("AttemptStepRecorder", () => {
    it("turns model answers into turns and tool calls into steps of the current turn", () => {
      const recorder = new AttemptStepRecorder(10_000);
      recorder.record(
        { type: "llm.response", usage: { inputTokens: 900, outputTokens: 40 } },
        15_000,
      );
      recorder.record({ type: "tool.called", tool: "read", args: { path: "src/acme.ts" } }, 16_000);
      recorder.record(
        { type: "tool.called", tool: "shell", args: { command: "pnpm test" } },
        17_000,
      );
      recorder.record(
        { type: "llm.response", usage: { inputTokens: 1200, outputTokens: 60 } },
        20_000,
      );
      recorder.record(
        { type: "tool.called", tool: "edit", args: { filePath: "src/acme.ts" } },
        21_000,
      );
      recorder.record({ type: "tool.result", tool: "edit" }, 21_500);
      expect(recorder.steps()).toEqual([
        { t: 5, step: 1, tool: "(step)", tokensIn: 900, tokensOut: 40 },
        { t: 6, step: 1, tool: "read", read: ["src/acme.ts"] },
        { t: 7, step: 1, tool: "shell", command: "pnpm test" },
        { t: 10, step: 2, tool: "(step)", tokensIn: 1200, tokensOut: 60 },
        { t: 11, step: 2, tool: "edit", edited: ["src/acme.ts"] },
      ]);
    });

    it("counts a tool call before any answer as turn 1, without a path it doesn't have", () => {
      const recorder = new AttemptStepRecorder(0);
      recorder.record({ type: "tool.called", tool: "grep", args: "acme" }, 2_000);
      expect(recorder.steps()).toEqual([{ t: 2, step: 1, tool: "grep" }]);
    });
  });
});
