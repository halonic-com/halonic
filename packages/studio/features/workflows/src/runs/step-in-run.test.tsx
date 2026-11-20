// @vitest-environment jsdom

import { runRow, type SourcedRun } from "@halonicjs/studio-feature-runs/api";
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
import { stepInRun } from "./step-in-run.ts";

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

const ended = { endedAt: "2026-11-09T10:45:00.000Z" };

/** What the line for `step` says of a run changed by `changes`. */
function lineFor(step: string, changes: Parameters<typeof runSummary>[0]) {
  const run: SourcedRun = { summary: runSummary(changes) };
  const row = runRow(run, {
    workflow: undefined,
    routine: undefined,
    currency: "EUR",
    now: new Date(2026, 10, 9, 11, 0),
  });
  return stepInRun(step, row, run);
}

const click = (button: HTMLElement | null | undefined) =>
  act(async () => {
    button?.click();
  });

/** Starts a run on a page whose Runs list already has `changes` as the run, then picks `step`. */
async function showRunAndPick(
  step: string,
  changes: Parameters<typeof runSummary>[0],
  openRun?: (runId: string, step?: string) => void,
) {
  const runs = memoryRuns([runSummary(changes)]);
  const { host } = memoryHost([], [], [reply], [], {
    startRun: async () => ({ runId: "run_mfx3k2a1_01jd8q" }),
  });
  const page = await show(
    <WorkflowScreen
      host={host}
      runs={runs.source}
      hubId="acme"
      id="reply"
      {...(openRun && { openRun })}
    />,
  );
  await click(
    [...page.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Run"),
  );
  await click(buttonNamed(page, "Start run"));
  await click(
    [...page.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find((card) =>
      card.textContent?.includes(step),
    ),
  );
  return page;
}

const stepCard = (page: HTMLElement) =>
  page.querySelector<HTMLElement>("aside[aria-label^='Step ']");

verifies("workflows.runs.step-in-run", () => {
  it("says a step the run took ran, and offers to see what went in and out", () => {
    expect(
      lineFor("draft", {
        status: "completed",
        state: "done",
        statesVisited: ["read", "draft", "done"],
        ...ended,
      }),
    ).toEqual({ line: "✓ Ran in run 01jd8q", reached: true });
  });

  it("counts a step the run visited more than once", () => {
    expect(
      lineFor("draft", {
        status: "completed",
        state: "done",
        statesVisited: ["read", "draft", "draft", "draft", "done"],
        ...ended,
      }).line,
    ).toBe("Ran 3 times in run 01jd8q");
  });

  it("says how the run stopped in the step it stopped in", () => {
    const where = { statesVisited: ["read", "draft"], state: "draft" };
    expect(lineFor("draft", { ...where, status: "failed", error: "x", ...ended }).line).toBe(
      "✕ Failed here in run 01jd8q",
    );
    expect(
      lineFor("draft", { ...where, status: "failed", reason: "cancelled", error: "x", ...ended })
        .line,
    ).toBe("Cancelled here in run 01jd8q");
    expect(
      lineFor("draft", { ...where, status: "failed", reason: "budget", error: "x", ...ended }).line,
    ).toBe("Stopped here in run 01jd8q");
    expect(lineFor("draft", { ...where, status: "running" }).line).toBe(
      "Running here in run 01jd8q",
    );
  });

  it("says a step the run never reached wasn't, with nothing to see", () => {
    expect(lineFor("done", { statesVisited: ["read", "draft"] })).toEqual({
      line: "Not reached in run 01jd8q",
      reached: false,
    });
  });

  it("docks the step's card with its line and the link while a run is shown", async () => {
    const page = await showRunAndPick(
      "draft",
      { status: "failed", state: "draft", error: "x", ...ended },
      vi.fn(),
    );

    expect(stepCard(page)?.textContent).toContain("✕ Failed here in run 01jd8q");
    expect(stepCard(page)?.textContent).toContain("See what went in and out ›");
    // Never wider than the page area, so a phone-narrow window doesn't scroll sideways (HAL-13162).
    expect(stepCard(page)?.className.split(" ")).toContain("max-w-full");
  });

  it("opens the run's page at the step from See what went in and out", async () => {
    const openRun = vi.fn();
    const page = await showRunAndPick(
      "draft",
      { status: "completed", state: "done", statesVisited: ["read", "draft", "done"], ...ended },
      openRun,
    );

    await click(buttonNamed(stepCard(page) ?? page, "See what went in and out"));

    expect(openRun).toHaveBeenCalledWith("run_mfx3k2a1_01jd8q", "draft");
  });

  it("gives a step the run never reached no link, and closes with Esc", async () => {
    const page = await showRunAndPick("done", { statesVisited: ["read", "draft"] });

    expect(stepCard(page)?.textContent).toContain("Not reached in run 01jd8q");
    expect(stepCard(page)?.textContent).not.toContain("See what went in and out");
    await act(async () => {
      stepCard(page)?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(stepCard(page)).toBeNull();
  });

  it("docks no step card when no run is shown", async () => {
    const { host } = memoryHost([], [], [reply]);
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );

    await click(
      [...page.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find((card) =>
        card.textContent?.includes("draft"),
      ),
    );

    expect(stepCard(page)).toBeNull();
  });

  it("docks the new run's card, not a step picked before the run started", async () => {
    const runs = memoryRuns([runSummary({ statesVisited: ["read", "draft"] })]);
    const { host } = memoryHost([], [], [reply], [], {
      startRun: async () => ({ runId: "run_mfx3k2a1_01jd8q" }),
    });
    const page = await show(
      <WorkflowScreen host={host} runs={runs.source} hubId="acme" id="reply" />,
    );
    await click(
      [...page.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find((card) =>
        card.textContent?.includes("draft"),
      ),
    );

    await click(
      [...page.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Run"),
    );
    await click(buttonNamed(page, "Start run"));

    expect(stepCard(page)).toBeNull();
    expect(page.textContent).toContain("01jd8q");
  });
});
