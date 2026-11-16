import type { RunEvent, RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { ProviderKind } from "../api.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { causeBanner } from "./failure-banner.ts";
import type { RunPageContext } from "./run-page-model.ts";

const kinds: Record<string, ProviderKind> = { ollama: "local", claude: "cloud" };
const context: RunPageContext = {
  workflow: { name: "Support reply", stepDescription: () => undefined },
  workflowOfRun: () => undefined,
  providerKind: (id) => kinds[id],
  currency: "EUR",
  now: mondayMorning,
};

function event(rest: Record<string, unknown>, seq: number): RunEvent {
  return { runId: "run_a", seq, at: "2026-11-16T08:00:00Z", ...rest } as RunEvent;
}

const call = (provider: string, model: string) =>
  event({ type: "llm.request", agent: "reporter", provider, model, messages: 1 }, 2);

function failed(reason: RunSummary["reason"]) {
  return summaryWith({ status: "failed", reason, error: "engine text", state: "draft" });
}

const lines = (banner: ReturnType<typeof causeBanner>) =>
  banner?.kind === "callout" ? banner.lines : undefined;

verifies("runs.run-view.harness-banner", () => {
  it("keeps the general banner for a provider that runs elsewhere, since it can't use this computer's memory", () => {
    const log = [call("claude", "claude-sonnet")];
    expect(causeBanner(failed("model-out-of-memory"), log, context, false)).toBeUndefined();
    const gone = [call("elsewhere", "m")];
    expect(lines(causeBanner(failed("model-out-of-memory"), gone, context, false))?.[0]).toContain(
      "this computer doesn't have enough free memory",
    );
  });

  describe("a harness program that didn't start", () => {
    const started = (harness: string, timeoutMs: number) =>
      event({ type: "harness.started", state: "draft", agent: "reporter", harness, timeoutMs }, 2);

    it("names the program, its limit and the step", () => {
      const log = [started("claude-code", 60_000)];
      expect(lines(causeBanner(failed("harness-start-failed"), log, context, false))).toEqual([
        "Reporter didn't start: Claude Code didn't start on this computer, or didn't answer within 60 seconds. Nothing ran in the step Draft.",
      ]);
    });

    it("says Codex, a program it doesn't know by its id, and one second", () => {
      const say = (harness: string, timeoutMs: number) =>
        lines(
          causeBanner(
            failed("harness-start-failed"),
            [started(harness, timeoutMs)],
            context,
            false,
          ),
        )?.[0];
      expect(say("codex", 30_000)).toContain("Codex didn't start");
      expect(say("aider", 1_000)).toContain(
        "Aider didn't start on this computer, or didn't answer within 1 second.",
      );
    });

    it("waits for the log, and for the program's start in it", () => {
      expect(
        causeBanner(failed("harness-start-failed"), undefined, context, false),
      ).toBeUndefined();
      expect(causeBanner(failed("harness-start-failed"), [], context, false)).toBeUndefined();
    });
  });
});
