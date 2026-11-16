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
const failedEvent = (host?: string) =>
  event({ type: "run.failed", state: "draft", error: "x", ...(host ? { host } : {}) }, 3);

function failed(reason: RunSummary["reason"], changes: Partial<RunSummary> = {}) {
  return summaryWith({
    status: "failed",
    reason,
    error: "engine text",
    state: "draft",
    ...changes,
  });
}

const lines = (banner: ReturnType<typeof causeBanner>) =>
  banner?.kind === "callout" ? banner.lines : undefined;

verifies("runs.run-view.failure-banners", () => {
  describe("a model that can't be reached", () => {
    it("tells a cloud provider's from the internet, with the host", () => {
      const log = [call("claude", "claude-sonnet"), failedEvent("api.anthropic.com")];
      expect(lines(causeBanner(failed("model-unreachable"), log, context, false))).toEqual([
        "Halonic couldn't reach Claude at `api.anthropic.com` for the model `claude-sonnet`. This computer may be offline. Check your internet connection, then run again.",
      ]);
    });

    it("tells a local provider's from the program that isn't running", () => {
      const log = [call("ollama", "llama3.2"), failedEvent("localhost:11434")];
      expect(lines(causeBanner(failed("model-unreachable"), log, context, false))).toEqual([
        "Halonic couldn't reach Ollama at `localhost:11434` for the model `llama3.2`. Ollama may not be running on this computer. Start Ollama, then run again.",
      ]);
    });

    it("picks by the provider's kind, not by the host, and leaves out a host it wasn't given", () => {
      const log = [call("ollama", "llama3.2"), failedEvent("api.example.net")];
      expect(lines(causeBanner(failed("model-unreachable"), log, context, false))?.[0]).toContain(
        "may not be running on this computer",
      );
      const gone = [call("elsewhere", "m"), failedEvent()];
      expect(lines(causeBanner(failed("model-unreachable"), gone, context, false))).toEqual([
        "Halonic couldn't reach Elsewhere for the model `m`. This computer may be offline. Check your internet connection, then run again.",
      ]);
    });

    it("waits for the log, and for a model call in it", () => {
      expect(causeBanner(failed("model-unreachable"), undefined, context, false)).toBeUndefined();
      expect(
        causeBanner(failed("model-unreachable"), [failedEvent()], context, false),
      ).toBeUndefined();
    });
  });

  describe("a model that doesn't fit in memory", () => {
    const log = [call("ollama", "llama3.1:70b")];

    it("says what to do on a computer", () => {
      expect(lines(causeBanner(failed("model-out-of-memory"), log, context, false))).toEqual([
        "Ollama couldn't load `llama3.1:70b`: this computer doesn't have enough free memory for it.",
        "Close other programs, or pick a smaller model in Models.",
      ]);
    });

    it("says to fix it on the computer, on a phone", () => {
      expect(lines(causeBanner(failed("model-out-of-memory"), log, context, true))).toEqual([
        "Ollama couldn't load `llama3.1:70b`: this computer doesn't have enough free memory for it.",
        "Close other programs, or pick a smaller model.",
        "Fix this on your computer: Models",
      ]);
    });
  });

  it("names the agent whose sandbox didn't start, never the engine's text", () => {
    const log = [
      event({ type: "agent.started", state: "draft", agent: "reporter", prompt: "" }, 1),
    ];
    expect(lines(causeBanner(failed("sandbox-start-failed"), log, context, false))).toEqual([
      "Reporter didn't start: the sandbox on this computer didn't start. Nothing ran.",
    ]);
    expect(lines(causeBanner(failed("sandbox-start-failed"), undefined, context, false))).toEqual([
      "The agent didn't start: the sandbox on this computer didn't start. Nothing ran.",
    ]);
  });

  it("says the disk is full, in the step it stopped in", () => {
    expect(lines(causeBanner(failed("disk-full"), undefined, context, false))).toEqual([
      "Support reply stopped in the step Draft: the disk is full, so Halonic couldn't write the run log. Free some space, then run again.",
    ]);
  });

  it("says the engine stopped, during a step or before the first", () => {
    const during = failed("interrupted", { statesVisited: ["draft"] });
    expect(lines(causeBanner(during, undefined, context, false))).toEqual([
      "Support reply stopped because Halonic's engine stopped during the step Draft. Nothing after that step ran.",
    ]);
    const before = failed("interrupted", { statesVisited: [], state: null });
    expect(lines(causeBanner(before, undefined, context, false))).toEqual([
      "Support reply stopped because Halonic's engine stopped before the first step. Nothing ran.",
    ]);
  });

  it("leaves every other run to the page's other banners", () => {
    expect(causeBanner(failed("error"), [], context, false)).toBeUndefined();
    expect(causeBanner(failed(null), [], context, false)).toBeUndefined();
    expect(
      causeBanner(summaryWith({ status: "running", reason: "disk-full" }), [], context, false),
    ).toBeUndefined();
  });
});
