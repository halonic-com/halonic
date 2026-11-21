// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkflowProblem, WorkflowView } from "../api.ts";
import { WorkflowScreen } from "../page/workflow-page.tsx";
import { buttonNamed, memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";

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

/** The header's Run, not the Runs tab, whose name starts the same. */
const runButton = (page: HTMLElement) =>
  [...page.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Run");

const click = (button: HTMLButtonElement | undefined) =>
  act(async () => {
    button?.click();
  });

/** The page of a workflow whose checks found `problems`, with a host that starts runs. */
async function openWithProblems(problems: readonly WorkflowProblem[]) {
  const started = vi.fn(async (_input: Record<string, unknown>) => ({ runId: "x" }));
  const configuration = {
    hubId: "acme",
    id: "reply",
    name: "Support reply",
    initial: "read",
    stepIds: ["read", "draft", "done"],
    file: "hubs/acme/workflows/reply.workflow.yaml",
    problems,
  };
  const { host } = memoryHost([], [], [reply], [configuration], {
    startRun: async (_ref, input) => started(input),
  });
  const page = await show(
    <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
  );
  return { page, started };
}

const unknownAlias: WorkflowProblem = {
  severity: "error",
  code: "unknown-model-alias",
  message: 'Agent "writer" uses unknown model alias "smrt"',
};
const deadEnd: WorkflowProblem = {
  severity: "error",
  code: "dead-end",
  message: '"draft" has no transitions',
  stepId: "draft",
};
const unreachable: WorkflowProblem = {
  severity: "warning",
  code: "unreachable",
  message: '"old" is unreachable',
  stepId: "old",
};

verifies("workflows.start.start-run", () => {
  it("says how many errors stop the run in place of Start run, and Open Problems shows them", async () => {
    const { page, started } = await openWithProblems([unknownAlias, deadEnd, unreachable]);
    await click(runButton(page));

    const card = page.querySelector("aside[aria-label='Start run']");
    expect(card?.textContent).toContain(
      "Support reply has 2 problems. Fix them before it can run.",
    );
    expect(buttonNamed(page, "Start run")).toBeUndefined();

    await click(buttonNamed(page, "Open Problems"));
    expect(page.querySelector("aside[aria-label='Start run']")).toBeNull();
    expect(page.textContent).toContain('Agent "writer" uses unknown model alias "smrt"');
    expect(started).not.toHaveBeenCalled();
  });

  it("puts the focus on Problems once Open Problems closed the card", async () => {
    const { page } = await openWithProblems([unknownAlias]);
    await click(runButton(page));
    await click(buttonNamed(page, "Open Problems"));
    await act(() => vi.advanceTimersByTimeAsync(1));

    const focused = document.activeElement;
    expect(focused?.getAttribute("role")).toBe("tab");
    expect(focused?.textContent).toContain("Problems");
    expect(focused?.getAttribute("aria-selected")).toBe("true");
  });

  it("says one error in the singular", async () => {
    const { page } = await openWithProblems([unknownAlias]);
    await click(runButton(page));

    expect(page.textContent).toContain("Support reply has 1 problem. Fix it before it can run.");
  });

  it("offers Start run when the workflow has only warnings, or nothing at all", async () => {
    for (const problems of [[unreachable], []]) {
      const { page, started } = await openWithProblems(problems);
      await click(runButton(page));
      expect(page.textContent).not.toContain("before it can run");
      await click(buttonNamed(page, "Start run"));
      expect(started).toHaveBeenCalledWith({});
      unmount();
    }
  });
});
