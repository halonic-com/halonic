// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { StartRefusal, WorkflowProblem, WorkflowView } from "../api.ts";
import { buttonNamed, memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { WorkflowScreen } from "./workflow-page.tsx";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

/** *Support reply*, whose step `draft` runs `writer` in Claude Code, so the sandbox is checked. */
const reply: WorkflowView = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  initial: "draft",
  steps: [
    {
      id: "draft",
      type: "task",
      agent: "writer",
      program: { agent: "writer", agentName: "Writer", harness: "claude-code" },
    },
    { id: "done", type: "final" },
  ],
  arrows: [{ from: "draft", to: "done" }],
  layout: {},
};

/** An error in the file of the agent `writer`, which the step `draft` names. */
const inWriter: WorkflowProblem = {
  severity: "error",
  code: "unknown-model-alias",
  message: 'Agent "writer" uses unknown model alias "smrt"',
};
/** An error in the workflow's own file. */
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

const connector: StartRefusal = {
  reason: "Writer uses a connector, which Studio can't start yet.",
  fix: "To start it, run this in a terminal:",
  command: "halonic run reply",
};

/**
 * The page of *Support reply* with `problems`, a sandbox that starts unless `sandbox` refuses, and
 * the files' refusal when there is one. `edit` gives it new problems and tells the page, as an edit
 * of a file does. `started` records the runs the host was asked to start.
 */
async function open(
  problems: readonly WorkflowProblem[],
  options: {
    readonly startRefusal?: StartRefusal;
    readonly sandbox?: "refuses";
    readonly phone?: boolean;
  } = {},
) {
  const started = vi.fn(async (_input: Record<string, unknown>) => ({ runId: "x" }));
  let found = problems;
  const { host, change } = memoryHost([], [], [reply], [], {
    configuration: async () => ({
      hubId: "acme",
      id: "reply",
      name: "Support reply",
      initial: "draft",
      stepIds: ["draft", "done"],
      file: "hubs/acme/workflows/reply.workflow.yaml",
      problems: found,
    }),
    startRun: async (_ref, input) => started(input),
    ...(options.startRefusal && { startRefusal: async () => options.startRefusal }),
  });
  const check = async () =>
    options.sandbox === "refuses"
      ? ({ ok: false, reason: "bubblewrap-missing" } as const)
      : ({ ok: true } as const);
  const page = await show(
    <PresentationProvider presentation={options.phone ? "phone" : "desktop"}>
      <WorkflowScreen
        host={host}
        runs={memoryRuns().source}
        hubId="acme"
        id="reply"
        sandboxStartCheck={{ check }}
      />
    </PresentationProvider>,
  );
  await act(async () => {});
  const edit = (next: readonly WorkflowProblem[]) =>
    act(async () => {
      found = next;
      change([]);
    });
  return { page, edit, started };
}

/** The header's Run, not the Runs tab, whose name starts the same. */
const runOf = (page: HTMLElement) =>
  [...page.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Run");

/** The lines that describe Run, in order. */
const describing = (page: HTMLElement) =>
  (runOf(page)?.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter((id) => id !== "")
    .map((id) => document.getElementById(id)?.textContent);

const sandboxLine = "Support reply can't run: the sandbox can't start on this computer.";

verifies("workflows.start.start-run", () => {
  it("makes Run unavailable while the workflow has errors, in its own file and in an agent it names, described by the band's first line", async () => {
    const { page } = await open([inWriter, deadEnd, unreachable]);
    const run = runOf(page) as HTMLButtonElement;

    expect(run.getAttribute("aria-disabled")).toBe("true");
    expect(run.disabled).toBe(false);
    expect(describing(page)).toEqual(["Support reply can't run: it has 2 problems."]);
    await act(async () => run.click());
    expect(page.textContent).not.toContain("START A RUN");
  });

  it("says one error in the singular, and makes Run unavailable on a phone too", async () => {
    const { page } = await open([deadEnd], { phone: true });

    expect(runOf(page)?.getAttribute("aria-disabled")).toBe("true");
    expect(describing(page)).toEqual(["Support reply can't run: it has 1 problem."]);
  });

  it("opens Configuration's Problems from the band, with the focus on Problems", async () => {
    const { page } = await open([deadEnd]);
    await act(async () => buttonNamed(page, "Open Problems")?.click());
    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(page.textContent).toContain('"draft" has no transitions');
    expect(document.activeElement?.getAttribute("role")).toBe("tab");
    expect(document.activeElement?.textContent).toContain("Problems");
  });

  it("leaves Run available, with no band, when the workflow has only warnings", async () => {
    const { page } = await open([unreachable]);

    expect(runOf(page)?.hasAttribute("aria-disabled")).toBe(false);
    expect(page.textContent).not.toContain("can't run");
  });

  it("shows only the problems line while there are errors and a connector, and the connector's once they are fixed", async () => {
    const { page, edit } = await open([deadEnd], { startRefusal: connector });

    expect(describing(page)).toEqual(["Support reply can't run: it has 1 problem."]);
    expect(page.querySelector("[data-testid='start-refusal']")).toBeNull();
    expect(page.textContent).not.toContain("halonic run reply");

    await edit([]);
    expect(describing(page)).toEqual([
      "Support reply can't run: Writer uses a connector, which Studio can't start yet.",
    ]);
  });

  it("shows the problems line first and the sandbox's after it, and Run is described by both", async () => {
    const { page } = await open([deadEnd, inWriter], { sandbox: "refuses" });

    expect(describing(page)).toEqual(["Support reply can't run: it has 2 problems.", sandboxLine]);
    const text = page.textContent ?? "";
    expect(text.indexOf("it has 2 problems")).toBeLessThan(text.indexOf(sandboxLine));
  });

  it("makes Run available as soon as the last error is fixed, with no reload", async () => {
    const { page, edit } = await open([deadEnd]);
    expect(runOf(page)?.getAttribute("aria-disabled")).toBe("true");

    await edit([unreachable]);
    expect(runOf(page)?.hasAttribute("aria-disabled")).toBe(false);
    expect(page.textContent).not.toContain("can't run");
    await act(async () => runOf(page)?.click());
    expect(page.textContent).toContain("START A RUN");
  });
});
