// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkflowView } from "../api.ts";
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
});

verifies("workflows.start.start-run", () => {
  /** The docked card's width classes: never wider than the page area, so a phone-narrow window doesn't scroll sideways (HAL-13162). */
  const capped = (page: HTMLElement, label: string) =>
    page.querySelector(`aside[aria-label='${label}']`)?.className.split(" ") ?? [];

  it("keeps the start card, the waiting line and the run's card within the page's width", async () => {
    const runs = memoryRuns();
    const { page } = await open(async () => ({ runId: "run_mfx3k2a1_01jd8q" }), runs);

    await click(runButton(page));
    expect(capped(page, "Start run")).toContain("max-w-full");
    await click(buttonNamed(page, "Start run"));
    expect(page.querySelector("aside[role='status']")?.className.split(" ")).toContain(
      "max-w-full",
    );
    await act(async () => {
      runs.change([runSummary({ status: "running", state: "draft" })]);
    });
    expect(capped(page, "Run 01jd8q")).toContain("max-w-full");
  });
});
