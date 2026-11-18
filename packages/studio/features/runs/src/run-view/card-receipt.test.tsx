// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { RunStartHost, RunsSource } from "../api.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RunCardReceipt } from "./card-receipt.tsx";
import { entered, logOf } from "./run-log.test-helper.ts";

afterEach(unmountAll);

const unreachable = summaryWith({
  id: "run_a_7k2m9p",
  status: "failed",
  reason: "model-unreachable",
  state: "draft",
  endedAt: mondayMorning.toISOString(),
});

const log = logOf(unreachable.id, [
  [0, entered("draft")],
  [0, { type: "llm.request", agent: "writer", provider: "ollama", model: "llama3.1", messages: 1 }],
]).map((event) => (event.type === "run.started" ? { ...event, input: { message: "Hi" } } : event));

const source: Pick<RunsSource, "workflow" | "currency" | "providerKind"> = {
  workflow: () => ({ name: "Support reply", stepDescription: () => undefined }),
  currency: () => "EUR",
  providerKind: () => "local",
};

function show(more: {
  runStart?: RunStartHost;
  openModels?: () => void;
  openStartedRun?: (runId: string) => void;
}) {
  return render(
    <RunCardReceipt
      source={source}
      run={{ summary: unreachable }}
      read={{ events: log, failure: undefined, damagedLine: undefined, retry: () => {} }}
      now={mondayMorning}
      openRun={vi.fn()}
      {...more}
    />,
  );
}

const button = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll("button")].find((one) => one.textContent === name);

verifies("runs.run-view.card-run-again", () => {
  it("offers Run again and Open Models on a failed banner, as the run page does", async () => {
    const startRun = vi.fn(async () => ({ runId: "run_b_new" }));
    const openStartedRun = vi.fn();
    const openModels = vi.fn();
    const root = show({ runStart: { startRun }, openModels, openStartedRun });

    expect(root.textContent).toContain("Start Ollama, then run again.");
    await act(async () => button(root, "Open Models")?.click());
    expect(openModels).toHaveBeenCalledOnce();
    await act(async () => button(root, "Run again")?.click());
    expect(startRun).toHaveBeenCalledWith(
      { hubId: "acme", workflowId: "support-reply" },
      { message: "Hi" },
    );
    expect(openStartedRun).toHaveBeenCalledWith("run_b_new");
  });

  it("says why Run again didn't start, above the banner", async () => {
    const startRun = vi.fn(async () => {
      throw Object.assign(new Error("The workflow changed."), { kind: "invalid_input" });
    });
    const root = show({ runStart: { startRun } });
    await act(async () => button(root, "Run again")?.click());
    expect(root.querySelector('section[aria-label="Run didn\'t start"]')?.textContent).toContain(
      "The workflow changed.",
    );
  });

  it("has neither button where the card is given neither", () => {
    const root = show({});
    expect(root.textContent).toContain("Start Ollama, then run again.");
    expect(button(root, "Run again")).toBeUndefined();
    expect(button(root, "Open Models")).toBeUndefined();
  });
});
