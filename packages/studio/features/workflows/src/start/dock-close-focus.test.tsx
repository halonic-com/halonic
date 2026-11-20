// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
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

afterEach(unmount);

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

/** The page with Run, its runs, and the Run button. */
async function openPage() {
  const runs = memoryRuns();
  const { host } = memoryHost([], [], [reply], [], {
    startRun: async () => ({ runId: "run_mfx3k2a1_01jd8q" }),
  });
  const page = await show(
    <WorkflowScreen host={host} runs={runs.source} hubId="acme" id="reply" />,
  );
  const run = [...page.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "Run",
  );
  return { page, runs, run };
}

const press = (button: HTMLElement | null | undefined) =>
  act(async () => {
    button?.click();
  });

const pressEscape = (page: HTMLElement) =>
  act(async () => {
    page
      .querySelector("aside")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

verifies("workflows.start.dock-close-focus", () => {
  it("gives focus back to Run when the start card closes by Escape, Close or Cancel", async () => {
    const { page, run } = await openPage();

    await press(run);
    expect(document.activeElement?.tagName).toBe("H2");
    await pressEscape(page);
    expect(page.querySelector("aside")).toBeNull();
    expect(document.activeElement).toBe(run);

    await press(run);
    await press(page.querySelector<HTMLElement>("aside button[aria-label='Close']"));
    expect(document.activeElement).toBe(run);

    await press(run);
    await press(buttonNamed(page, "Cancel"));
    expect(document.activeElement).toBe(run);
  });

  it("gives focus back to Run when the waiting line closes", async () => {
    const { page, run } = await openPage();
    await press(run);
    await press(buttonNamed(page, "Start run"));

    await press(page.querySelector<HTMLElement>("aside[role='status'] button"));

    expect(page.querySelector("aside")).toBeNull();
    expect(document.activeElement).toBe(run);
  });

  it("gives focus back to Run when the run's card closes by Escape or Close run", async () => {
    const { page, runs, run } = await openPage();
    const showRun = async () => {
      await press(run);
      await press(buttonNamed(page, "Start run"));
      await act(async () => runs.change([runSummary({ status: "running", state: "read" })]));
      expect(page.querySelector("aside[aria-label='Run 01jd8q']")).not.toBeNull();
    };

    await showRun();
    await pressEscape(page);
    expect(document.activeElement).toBe(run);

    await showRun();
    await press(page.querySelector<HTMLElement>("aside button[aria-label='Close run']"));
    expect(document.activeElement).toBe(run);
  });
});
