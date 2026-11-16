// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EngineNotAnswering, type WorkflowView } from "../api.ts";
import { WorkflowScreen } from "../page/workflow-page.tsx";
import {
  buttonNamed,
  memoryHost,
  memoryRuns,
  runSummary,
  show,
  unmount,
} from "../test-support.tsx";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const reply: WorkflowView = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  initial: "read",
  steps: [
    { id: "read", type: "task" },
    { id: "draft", type: "task", agent: "writer" },
    { id: "done", type: "final" },
  ],
  arrows: [
    { from: "read", to: "draft" },
    { from: "draft", to: "done" },
  ],
  layout: {},
};

/** Types into the card's input the way a person does, so React sees the change. */
const typeInput = (page: HTMLElement, value: string) =>
  act(async () => {
    const field = page.querySelector("textarea");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
      field,
      value,
    );
    field?.dispatchEvent(new Event("input", { bubbles: true }));
  });

/** The header's Run, not the Runs tab, whose name starts the same. */
const runButton = (page: HTMLElement) =>
  [...page.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Run");

const click = (button: HTMLButtonElement | undefined) =>
  act(async () => {
    button?.click();
  });

async function open(
  startRun: ((input: Record<string, unknown>) => Promise<{ runId: string }>) | undefined,
  runs = memoryRuns(),
) {
  const { host } = memoryHost([], [], [reply], [], {
    ...(startRun && { startRun: async (_ref, input) => startRun(input) }),
  });
  const page = await show(
    <WorkflowScreen host={host} runs={runs.source} hubId="acme" id="reply" />,
  );
  return { page, runs };
}

verifies("workflows.start.start-run", () => {
  it("shows Run only when the host can start runs", async () => {
    const without = await open(undefined);
    expect(runButton(without.page)).toBeUndefined();
    unmount();
    const withIt = await open(async () => ({ runId: "x" }));
    expect(runButton(withIt.page)).toBeDefined();
  });

  it("starts the run with the input and shows the strip and the run's card", async () => {
    const started = vi.fn(async () => ({ runId: "run_mfx3k2a1_01jd8q" }));
    const runs = memoryRuns();
    const { page } = await open(started, runs);

    await click(runButton(page));
    await typeInput(page, '{"from": "a@example.com"}');
    runs.change([
      runSummary({ status: "completed", state: "done", endedAt: "2026-11-09T10:45:00.000Z" }),
    ]);
    await click(buttonNamed(page, "Start run"));

    expect(started).toHaveBeenCalledWith({ from: "a@example.com" });
    expect(page.textContent).toContain("Showing run 01jd8q · done");
    expect(page.querySelector("aside[aria-label='Run 01jd8q']")).not.toBeNull();
  });

  it("says it is waiting in the dock until the runs list the new run", async () => {
    const runs = memoryRuns();
    const { page } = await open(async () => ({ runId: "run_mfx3k2a1_01jd8q" }), runs);

    await click(runButton(page));
    await click(buttonNamed(page, "Start run"));

    expect(page.textContent).toContain("Run started. Waiting for it to appear…");
    expect(page.querySelector("aside[aria-label='Run 01jd8q']")).toBeNull();
    await act(async () => {
      runs.change([runSummary({ status: "running", state: "draft" })]);
    });
    expect(page.textContent).not.toContain("Waiting for it to appear");
    expect(page.querySelector("aside[aria-label='Run 01jd8q']")).not.toBeNull();
  });

  it("closes the dock with the strip, so it never waits for a run that is already listed", async () => {
    const runs = memoryRuns();
    const { page } = await open(async () => ({ runId: "run_mfx3k2a1_01jd8q" }), runs);

    await click(runButton(page));
    await click(buttonNamed(page, "Start run"));
    await act(async () => {
      runs.change([runSummary({ status: "running", state: "draft" })]);
    });
    await click(
      page.querySelector<HTMLButtonElement>("button[aria-label='Stop showing this run']") ??
        undefined,
    );

    expect(page.textContent).not.toContain("Waiting for it to appear");
    expect(page.querySelector("aside[aria-label='Run 01jd8q']")).toBeNull();
  });

  it("says how a failed run ended and rings its step with Failed", async () => {
    const runs = memoryRuns([
      runSummary({
        status: "failed",
        state: "draft",
        endedAt: "2026-11-09T10:45:00.000Z",
        error: "x",
      }),
    ]);
    const { page } = await open(async () => ({ runId: "run_mfx3k2a1_01jd8q" }), runs);

    await click(runButton(page));
    await click(buttonNamed(page, "Start run"));

    expect(page.textContent).toContain("Showing run 01jd8q · failed in Draft");
    expect(page.textContent).toContain("Failed");
    expect(page.querySelector(".ring-danger")?.textContent).toContain("draft");
    await click(
      page.querySelector<HTMLButtonElement>("button[aria-label='Stop showing this run']") ??
        undefined,
    );
    expect(page.textContent).not.toContain("Showing run");
  });

  it("keeps the card and the input, and offers Try again, when the engine isn't answering", async () => {
    const attempts = vi
      .fn<(input: Record<string, unknown>) => Promise<{ runId: string }>>()
      .mockRejectedValueOnce(new EngineNotAnswering())
      .mockResolvedValue({ runId: "run_mfx3k2a1_01jd8q" });
    const { page } = await open(attempts);

    await click(runButton(page));
    await typeInput(page, '{"a": 1}');
    await click(buttonNamed(page, "Start run"));

    expect(page.textContent).toContain(
      "Couldn't start the run: the engine isn't answering. It may still be starting.",
    );
    expect(page.querySelector("textarea")?.value).toBe('{"a": 1}');
    await click(buttonNamed(page, "Try again"));
    expect(attempts).toHaveBeenCalledTimes(2);
    expect(attempts).toHaveBeenLastCalledWith({ a: 1 });
  });

  it("never shows the message of an error without a kind", async () => {
    const { page } = await open(async () => {
      throw new Error("ENOENT: .halonic/runs.json");
    });

    await click(runButton(page));
    await click(buttonNamed(page, "Start run"));

    expect(page.textContent).toContain(
      "Couldn't start the run: Halonic ran into a problem it can't explain yet.",
    );
    expect(page.textContent).not.toContain("ENOENT");
  });

  it("says another reason as the host gave it, with a full stop", async () => {
    const { page } = await open(async () => {
      throw new KindedError("unavailable", "The disk is full");
    });

    await click(runButton(page));
    await click(buttonNamed(page, "Start run"));

    expect(page.textContent).toContain("Couldn't start the run: The disk is full.");
  });

  it("starts nothing when the input isn't a JSON object", async () => {
    const started = vi.fn(async () => ({ runId: "x" }));
    const { page } = await open(started);

    await click(runButton(page));
    await typeInput(page, "[1]");
    await click(buttonNamed(page, "Start run"));

    expect(page.textContent).toContain("The input has to be a JSON object, such as {}.");
    expect(started).not.toHaveBeenCalled();
  });
});
