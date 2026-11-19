// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { PresentationProvider } from "@halonicjs/studio-kit";
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
  it("gives the dock's card the whole page on a phone, with the tab's view back once it closes", async () => {
    const { host } = memoryHost([], [], [reply], [], { startRun: async () => ({ runId: "x" }) });
    const page = await show(
      <PresentationProvider presentation="phone">
        <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />
      </PresentationProvider>,
    );
    const panel = () => page.querySelector<HTMLElement>("[role=tabpanel]");
    expect(panel()?.className).not.toBe("hidden");

    await click(runButton(page));
    expect(page.querySelector("textarea")).not.toBeNull();
    expect(panel()?.className).toBe("hidden");

    await click(buttonNamed(page, "Cancel"));
    expect(panel()?.className).not.toBe("hidden");
  });

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

  it("shows the next step of a refusal in place of Try again", async () => {
    const { page } = await open(async () => {
      throw new KindedError("unavailable", "Writer uses the model provider Anthropic.", {
        fix: "Run this workflow from the command line, or give the agent the mock model",
      });
    });

    await click(runButton(page));
    await click(buttonNamed(page, "Start run"));

    expect(page.textContent).toContain(
      "Couldn't start the run: Writer uses the model provider Anthropic.",
    );
    expect(page.textContent).toContain(
      "Run this workflow from the command line, or give the agent the mock model.",
    );
    expect(page.textContent).not.toContain("Try again");
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

  /** The page with a host whose tests are `cases`, and the card open. */
  async function openWithTests(inputs: readonly string[]) {
    const { host } = memoryHost([], [], [reply], [], {
      startRun: async () => ({ runId: "run_mfx3k2a1_01jd8q" }),
      tests: async () => ({ cases: inputs.map((input, n) => ({ name: `case ${n}`, input })) }),
    });
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );
    await click(runButton(page));
    return page;
  }

  it("titles the card with the workflow's name", async () => {
    const page = await openWithTests([]);

    expect(page.querySelector("aside h2")?.textContent).toBe("Run Support reply");
  });

  it("fills the input from the first test and says so", async () => {
    const page = await openWithTests(['{"from": "a@example.com"}', '{"from": "b@example.com"}']);

    expect(page.querySelector("textarea")?.value).toBe('{"from": "a@example.com"}');
    expect(page.textContent).toContain("Filled from the first test.");
  });

  it("keeps {} and says nothing when the workflow has no test", async () => {
    const page = await openWithTests([]);

    expect(page.querySelector("textarea")?.value).toBe("{}");
    expect(page.textContent).not.toContain("Filled from the first test.");
  });

  it("drops the note once the person types", async () => {
    const page = await openWithTests(['{"from": "a@example.com"}']);
    await typeInput(page, "{}");

    expect(page.textContent).not.toContain("Filled from the first test.");
  });

  it("closes the card with Cancel and starts nothing", async () => {
    const started = vi.fn(async () => ({ runId: "x" }));
    const { page } = await open(started);
    await click(runButton(page));
    await click(buttonNamed(page, "Cancel"));

    expect(page.querySelector("aside[aria-label='Start run']")).toBeNull();
    expect(started).not.toHaveBeenCalled();
  });
});
