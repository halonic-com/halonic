// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkflowView } from "../api.ts";
import {
  buttonNamed,
  memoryHost,
  memoryRuns,
  runSummary,
  show,
  unmount,
} from "../test-support.tsx";
import { WorkflowScreen } from "./workflow-page.tsx";

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
    { id: "done", type: "final" },
  ],
  arrows: [{ from: "read", to: "done" }],
  layout: {},
};

const click = (button: HTMLButtonElement | null | undefined) =>
  act(async () => {
    button?.click();
  });

/** The header's Run, not the Runs tab, whose name starts the same. */
const runButton = (page: HTMLElement) =>
  [...page.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Run");

const runsTab = (page: HTMLElement) =>
  [...page.querySelectorAll<HTMLButtonElement>("[role=tab]")].find((tab) =>
    tab.textContent?.startsWith("Runs"),
  );

/** Every card of the run 01jd8q on the page, the dock's and the Runs view's alike. */
const runCards = (page: HTMLElement) => page.querySelectorAll("aside[aria-label='Run 01jd8q']");

async function open(runs = memoryRuns()) {
  const { host } = memoryHost([], [], [reply], [], {
    startRun: async () => ({ runId: "run_mfx3k2a1_01jd8q" }),
  });
  return show(<WorkflowScreen host={host} runs={runs.source} hubId="acme" id="reply" />);
}

verifies("workflows.runs.runs-view", () => {
  it("closes the dock's card of a run when its row opens in Runs, so one card shows", async () => {
    const runs = memoryRuns();
    const page = await open(runs);
    await click(runButton(page));
    await click(buttonNamed(page, "Start run"));
    await act(async () => {
      runs.change([runSummary({ status: "running", state: "read" })]);
    });
    expect(runCards(page)).toHaveLength(1);

    await click(runsTab(page));
    await click(page.querySelector<HTMLButtonElement>("[role=tabpanel] li button"));

    expect(runCards(page)).toHaveLength(1);
    expect(page.querySelector("[role=tabpanel] aside[aria-label='Run 01jd8q']")).not.toBeNull();
  });
});

verifies("workflows.start.start-run", () => {
  it("closes the Runs view's card when Run opens the start card, so one card shows", async () => {
    const page = await open(memoryRuns([runSummary({ status: "running", state: "read" })]));
    await click(runsTab(page));
    const row = page.querySelector<HTMLButtonElement>("[role=tabpanel] li button");
    await click(row);
    expect(runCards(page)).toHaveLength(1);

    await click(runButton(page));

    expect(runCards(page)).toHaveLength(0);
    expect(row?.getAttribute("aria-pressed")).toBe("false");
    expect(page.querySelector("textarea")).not.toBeNull();
  });
});
