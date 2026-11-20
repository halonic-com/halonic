import type { RunFailureReason } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { isSetupCause, type RunFailedEvent, runFailureOf } from "./run-failure.ts";

/** A `run.failed` event with `reason`, and `change` on top. */
function failedWith(
  reason: RunFailureReason,
  change: Partial<RunFailedEvent> = {},
): RunFailedEvent {
  return {
    runId: "01JD8Q",
    seq: 9,
    at: "2026-11-10T09:00:00.000Z",
    type: "run.failed",
    state: "draft",
    error: "the engine's own words",
    reason,
    ...change,
  };
}

const general = { reason: "error", message: "the engine's own words" };

// A provider the workspace doesn't have, a workflow step the run can't go on
// from and an answer that isn't JSON (HAL-14301), apart from run-failure.test.ts
// to keep each file under 500 lines.
verifies("app.run-failure", () => {
  describe("the causes Nina's C340 check found", () => {
    it("names a provider a model names that the workspace doesn't have, by alias or shorthand, as the workspace's setup (HAL-14301)", () => {
      const byAlias = {
        kind: "not_found" as const,
        code: "models.no-provider",
        detail: { provider: "anthropic", alias: "claude" },
      };
      expect(runFailureOf(failedWith("error", { cause: byAlias }), undefined)).toEqual({
        reason: "unknown-provider",
        provider: "anthropic",
        alias: "claude",
      });
      expect(isSetupCause(byAlias)).toBe(true);
      const byShorthand = { ...byAlias, detail: { provider: "mok", model: "mok/echo" } };
      expect(runFailureOf(failedWith("error", { cause: byShorthand }), undefined)).toEqual({
        reason: "unknown-provider",
        provider: "mok",
        model: "mok/echo",
      });
      const nameless = { ...byAlias, detail: { provider: "mok" } };
      expect(runFailureOf(failedWith("error", { cause: nameless }), undefined)).toEqual(general);
    });

    it("names a workflow step the run can't go on from, as the workspace's setup (HAL-14301)", () => {
      const kind = "invalid_input" as const;
      const items = {
        kind,
        code: "workflow.items-not-a-list",
        detail: { state: "each", items: "{{input.topics}}", gives: "text" },
      };
      expect(runFailureOf(failedWith("error", { cause: items }), undefined)).toEqual({
        reason: "items-not-a-list",
        items: "{{input.topics}}",
        gives: "text",
      });
      const transition = {
        kind,
        code: "workflow.no-transition",
        detail: { state: "draft", event: "done" },
      };
      expect(runFailureOf(failedWith("error", { cause: transition }), undefined)).toEqual({
        reason: "no-transition",
        event: "done",
        takes: [],
      });
      const named = { ...transition, detail: { ...transition.detail, takes: "approve,reject" } };
      expect(runFailureOf(failedWith("error", { cause: named }), undefined)).toMatchObject({
        takes: ["approve", "reject"],
      });
      const noAgent = { kind, code: "workflow.task-without-agent", detail: { state: "draft" } };
      expect(runFailureOf(failedWith("error", { cause: noAgent }), undefined)).toEqual({
        reason: "task-without-agent",
      });
      expect([items, transition, noAgent].every((cause) => isSetupCause(cause))).toBe(true);
      const { detail: _, ...withoutFacts } = items;
      expect(runFailureOf(failedWith("error", { cause: withoutFacts }), undefined)).toEqual(
        general,
      );
    });

    it("knows the cause of an answer that isn't the JSON its step asks for, without making it setup (HAL-14301)", () => {
      const cause = {
        kind: "invalid_input" as const,
        code: "answer.not-json",
        detail: { agent: "writer" },
      };
      expect(runFailureOf(failedWith("error", { cause }), undefined)).toEqual({
        ...general,
        causeKnown: true,
      });
      expect(isSetupCause(cause)).toBe(false);
    });
  });
});
