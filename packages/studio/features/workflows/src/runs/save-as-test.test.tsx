// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkflowConfiguration, WorkflowsHost, WorkflowTests, WorkflowView } from "../api.ts";
import { WorkflowScreen } from "../page/workflow-page.tsx";
import {
  buttonNamed,
  memoryHost,
  memoryRuns,
  openDialogsInJsdom,
  runSummary,
  show,
  typeInto,
  unmount,
} from "../test-support.tsx";

beforeEach(() => {
  openDialogsInJsdom();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
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
const configuration: WorkflowConfiguration = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  initial: "read",
  stepIds: ["read", "done"],
  file: "hubs/acme/workflows/reply.workflow.yaml",
  problems: [],
};
const happyPath = { name: "Happy path", input: "{}" };
const finished = runSummary({
  status: "completed",
  state: null,
  statesVisited: ["read", "done"],
  endedAt: "2026-11-09T10:45:00.000Z",
});

const click = (button: HTMLElement | null | undefined) =>
  act(async () => {
    button?.click();
  });

/** The Runs view of a page whose only run is `summary`, with its row's card open. */
async function openRunCard(
  summary = finished,
  overrides: Partial<WorkflowsHost> = {},
  writes = true,
) {
  let cases: WorkflowTests["cases"] = [happyPath];
  const { host } = memoryHost([], [], [reply], [configuration], {
    tests: async () => ({ cases }),
    ...(writes && {
      saveRunAsTest: async (_ref: unknown, _runId: string, name: string) => {
        cases = [...cases, { name, input: "{}" }];
      },
    }),
    ...overrides,
  });
  const runs = memoryRuns([summary]);
  const page = await show(
    <WorkflowScreen host={host} runs={runs.source} hubId="acme" id="reply" />,
  );
  await click(
    [...page.querySelectorAll<HTMLElement>("[role=tab]")].find((tab) =>
      tab.textContent?.startsWith("Runs"),
    ),
  );
  await click(page.querySelector("button[aria-pressed]"));
  return page;
}

const dialogInput = () =>
  document.querySelector<HTMLInputElement>("[role=dialog] input, dialog input");

verifies("workflows.runs.save-as-test", () => {
  it("offers Save as test on a finished run when the host writes test cases", async () => {
    const page = await openRunCard();

    expect(buttonNamed(page, "Save as test")).toBeDefined();
  });

  it("offers none for a run still going or a host that can't write cases", async () => {
    const going = await openRunCard(runSummary({ status: "running" }));
    expect(buttonNamed(going, "Save as test")).toBeUndefined();
    unmount();
    const without = await openRunCard(finished, {}, false);
    expect(buttonNamed(without, "Save as test")).toBeUndefined();
  });

  it("starts the name as the run's number", async () => {
    const page = await openRunCard();

    await click(buttonNamed(page, "Save as test"));

    expect(document.body.textContent).toContain("Save as test");
    expect(dialogInput()?.value).toBe("Run 01jd8q");
  });

  it("says an empty name and a taken one, and writes nothing", async () => {
    const saveRunAsTest = vi.fn(async (_ref: unknown, _runId: string, _name: string) => {});
    const page = await openRunCard(finished, { saveRunAsTest });
    await click(buttonNamed(page, "Save as test"));

    await typeInto(dialogInput() as HTMLInputElement, "");
    await click(buttonNamed(document.body, "Create test"));
    expect(document.body.textContent).toContain("Give it a name.");

    await typeInto(dialogInput() as HTMLInputElement, "Happy path");
    await click(buttonNamed(document.body, "Create test"));
    expect(document.body.textContent).toContain("There's already a test called “Happy path”.");
    expect(saveRunAsTest).not.toHaveBeenCalled();
  });

  it("saves the run and opens Configuration on Tests with the new case picked", async () => {
    const saveRunAsTest = vi.fn(async (_ref: unknown, _runId: string, _name: string) => {});
    let cases: WorkflowTests["cases"] = [happyPath];
    const page = await openRunCard(finished, {
      saveRunAsTest: async (ref, runId, name) => {
        await saveRunAsTest(ref, runId, name);
        cases = [...cases, { name, input: "{}" }];
      },
      tests: async () => ({ cases }),
    });
    await click(buttonNamed(page, "Save as test"));

    await typeInto(dialogInput() as HTMLInputElement, "Quick reply");
    await click(buttonNamed(document.body, "Create test"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(saveRunAsTest).toHaveBeenCalledWith(
      { hubId: "acme", id: "reply" },
      "run_mfx3k2a1_01jd8q",
      "Quick reply",
    );
    expect(page.querySelector("aside[aria-label='Test Quick reply']")).not.toBeNull();
  });

  it("keeps the dialog open and says why when the host can't write the case", async () => {
    const page = await openRunCard(finished, {
      saveRunAsTest: async () => {
        throw new Error("The disk is full");
      },
    });
    await click(buttonNamed(page, "Save as test"));

    await click(buttonNamed(document.body, "Create test"));
    // The dialog's alert slot fills a frame after the request ends.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(document.body.textContent).toContain("Couldn't create the test: The disk is full.");
    expect(dialogInput()).not.toBeNull();
  });

  it("shows the new case when the run is saved from the dock while on Configuration", async () => {
    let cases: WorkflowTests["cases"] = [happyPath];
    const { host } = memoryHost([], [], [reply], [configuration], {
      tests: async () => ({ cases }),
      startRun: async () => ({ runId: "run_mfx3k2a1_01jd8q" }),
      saveRunAsTest: async (_ref: unknown, _runId: string, name: string) => {
        cases = [...cases, { name, input: "{}" }];
      },
    });
    const runs = memoryRuns([finished]);
    const page = await show(
      <WorkflowScreen host={host} runs={runs.source} hubId="acme" id="reply" />,
    );
    const tab = (label: string) =>
      [...page.querySelectorAll<HTMLElement>("[role=tab]")].find((one) =>
        one.textContent?.startsWith(label),
      );
    await click(tab("Configuration"));
    await click(
      [...page.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Run"),
    );
    await click(buttonNamed(page, "Start run"));
    await click(buttonNamed(page, "Save as test"));

    await typeInto(dialogInput() as HTMLInputElement, "Quick reply");
    await click(buttonNamed(document.body, "Create test"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(page.querySelector("aside[aria-label='Test Quick reply']")).not.toBeNull();
  });
});
