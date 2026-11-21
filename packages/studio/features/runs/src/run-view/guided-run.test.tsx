// @vitest-environment jsdom
import type { RunFailureReason, RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderKind, RunsSource } from "../api.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RunCardReceipt } from "./card-receipt.tsx";
import { lastModelCall, modelEscalation, tooSmallAgent } from "./guided-run.ts";
import { entered, logOf } from "./run-log.test-helper.ts";

afterEach(unmountAll);

/** A run of Support reply whose last event is the Sorter's call to `provider`. */
function sorterCalling(provider: string, summary: RunSummary) {
  return logOf(summary.id, [
    [0, entered("sort")],
    [0, { type: "llm.request", agent: "sorter", provider, model: "a-model", messages: 1 }],
  ]);
}

const kinds: Record<string, ProviderKind> = { anthropic: "cloud", ollama: "local" };

const source: Pick<RunsSource, "workflow" | "currency" | "providerKind" | "agentName"> = {
  workflow: () => ({ name: "Support reply", stepDescription: () => undefined }),
  currency: () => "EUR",
  providerKind: (id) => kinds[id],
  agentName: (id) => (id === "sorter" ? "Sorter" : undefined),
};

/** The card of `summary` calling `provider`, `seconds` after the call, with or without the guide. */
function card(
  provider: string,
  summary: RunSummary,
  { seconds = 0, pickAnotherModel }: { seconds?: number; pickAnotherModel?: () => void },
) {
  const startRun = vi.fn(async () => ({ runId: "run_b_new" }));
  return render(
    <RunCardReceipt
      source={source}
      run={{ summary }}
      read={{
        events: sorterCalling(provider, summary),
        failure: undefined,
        damagedLine: undefined,
        retry: () => {},
      }}
      now={new Date(mondayMorning.getTime() + seconds * 1000)}
      openRun={vi.fn()}
      runStart={{ startRun }}
      pickAnotherModel={pickAnotherModel}
    />,
  );
}

const running = summaryWith({ status: "running", state: "sort" });

const failedWith = (reason: RunFailureReason) =>
  summaryWith({
    status: "failed",
    reason,
    state: "sort",
    endedAt: mondayMorning.toISOString(),
  });

const buttonsOf = (root: HTMLElement) =>
  [...root.querySelectorAll("button")].map((button) => button.textContent);

const stillNoAnswer =
  "Still no answer. You can keep waiting, or use another model. Nothing is lost.";

verifies("runs.run-view.guided-run", () => {
  describe("the waiting line on a slow model", () => {
    it("says a model with a key is taking longer at 20 seconds, with no way out yet", () => {
      expect(modelEscalation(false, 19_999)).toEqual({
        reason: undefined,
        offersAnotherModel: false,
      });
      const root = card("anthropic", running, { seconds: 25, pickAnotherModel: vi.fn() });
      expect(root.textContent).toContain("Waiting for Anthropic");
      expect(root.textContent).toContain(
        "This is taking longer than usual. The model is still working.",
      );
      expect(buttonsOf(root)).not.toContain("Pick another model");
    });

    it("offers another model for a key at 60 seconds", async () => {
      const pickAnotherModel = vi.fn();
      const root = card("anthropic", running, { seconds: 61, pickAnotherModel });
      expect(root.textContent).toContain(stillNoAnswer);
      const pick = [...root.querySelectorAll("button")].find(
        (button) => button.textContent === "Pick another model",
      );
      await act(async () => pick?.click());
      expect(pickAnotherModel).toHaveBeenCalledOnce();
    });

    it("says a model on this computer is loading, and waits about 3 minutes to offer another", () => {
      const root = card("ollama", running, { seconds: 120, pickAnotherModel: vi.fn() });
      expect(root.textContent).toContain("Loading the model. The first run is slow.");
      expect(buttonsOf(root)).not.toContain("Pick another model");
      expect(modelEscalation(true, 180_000)).toEqual({
        reason: stillNoAnswer,
        offersAnotherModel: true,
      });
    });

    it("counts a provider of the local kind as on this computer, as Ollama always is", () => {
      const log = sorterCalling("lm-studio", running);
      expect(lastModelCall(log, () => "local")?.local).toBe(true);
      expect(lastModelCall(log, () => "cloud")?.local).toBe(false);
      expect(lastModelCall(sorterCalling("ollama", running))?.local).toBe(true);
    });

    it("shows no waiting line on a card that isn't guided", () => {
      const root = card("anthropic", running, { seconds: 61 });
      expect(root.textContent).not.toContain(stillNoAnswer);
      expect(buttonsOf(root)).not.toContain("Pick another model");
    });
  });

  describe("a failed run", () => {
    it("offers Try again, then Pick another model, for a model with a key", () => {
      const root = card("anthropic", failedWith("error"), { pickAnotherModel: vi.fn() });
      const buttons = buttonsOf(root);
      expect(buttons.indexOf("Try again")).toBeLessThan(buttons.indexOf("Pick another model"));
      expect(buttons).not.toContain("Run again");
      expect(root.textContent).not.toContain("too small");
    });

    it("says a model on this computer may be too small, and offers another model first", () => {
      const root = card("ollama", failedWith("answer-not-an-option"), {
        pickAnotherModel: vi.fn(),
      });
      expect(root.textContent).toContain(
        "This model may be too small for the Sorter. Try a larger one, or use Sample answers.",
      );
      const buttons = buttonsOf(root);
      expect(buttons.indexOf("Pick another model")).toBeLessThan(buttons.indexOf("Try again"));
    });

    it("doesn't call a model too small when it never answered", () => {
      const root = card("ollama", failedWith("model-unreachable"), { pickAnotherModel: vi.fn() });
      expect(root.textContent).not.toContain("too small");
      const buttons = buttonsOf(root);
      expect(buttons.indexOf("Try again")).toBeLessThan(buttons.indexOf("Pick another model"));
      expect(
        tooSmallAgent("model-out-of-memory", { agent: "sorter", provider: "ollama", local: true }),
      ).toBeUndefined();
    });

    it("keeps Run again and no other model on a card that isn't guided", () => {
      const root = card("anthropic", failedWith("error"), {});
      expect(buttonsOf(root)).toContain("Run again");
      expect(buttonsOf(root)).not.toContain("Pick another model");
    });
  });
});
