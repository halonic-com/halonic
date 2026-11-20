// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { ShownRuns } from "@halonicjs/studio-feature-inbox/api";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EngineNotAnswering, StartInTerminal, type WorkflowView } from "../api.ts";
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

/** A run that failed because Ollama wasn't running, with the log Run again reads its input from. */
function failedRunWithLog() {
  const failed = runSummary({
    status: "failed",
    state: "draft",
    reason: "model-unreachable",
    endedAt: "2026-11-09T10:45:00.000Z",
  });
  const memory = memoryRuns([failed]);
  const at = failed.startedAt;
  const runs = {
    ...memory,
    source: {
      ...memory.source,
      providerKind: () => "local" as const,
      log: async () => [
        {
          type: "run.started" as const,
          hubId: "acme",
          workflowId: "reply",
          input: { a: 1 },
          kind: "run" as const,
          definitionsVersion: "v1",
          runId: failed.id,
          seq: 1,
          at,
        },
        { type: "state.entered" as const, state: "draft", runId: failed.id, seq: 2, at },
        {
          type: "llm.request" as const,
          agent: "writer",
          provider: "ollama",
          model: "llama3.1",
          messages: 1,
          runId: failed.id,
          seq: 3,
          at,
        },
      ],
    },
  };
  return { failed, runs };
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

    expect(page.textContent).toContain("Couldn't start the run: the disk is full.");
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

  it("offers Run again and Open Models on the shown run's failed banner, and docks the new run", async () => {
    const { failed, runs } = failedRunWithLog();
    const started = vi
      .fn<(input: Record<string, unknown>) => Promise<{ runId: string }>>()
      .mockResolvedValueOnce({ runId: failed.id })
      .mockResolvedValueOnce({ runId: "run_mfx3k2a1_02kq7w" });
    const openModels = vi.fn();
    const { host } = memoryHost([], [], [reply], [], {
      startRun: async (_ref, input) => started(input),
    });
    const page = await show(
      <WorkflowScreen
        host={host}
        runs={runs.source}
        hubId="acme"
        id="reply"
        openModels={openModels}
      />,
    );

    await click(runButton(page));
    await click(buttonNamed(page, "Start run"));
    expect(page.textContent).toContain("Start Ollama, then run again.");
    await click(buttonNamed(page, "Open Models"));
    expect(openModels).toHaveBeenCalledOnce();

    await click(buttonNamed(page, "Run again"));
    expect(started).toHaveBeenLastCalledWith({ a: 1 });
    await act(async () => {
      runs.change([runSummary({ id: "run_mfx3k2a1_02kq7w", status: "running" }), failed]);
    });
    expect(page.querySelector("aside[aria-label='Run 02kq7w']")).not.toBeNull();
  });

  it("says why the card's Run again didn't start to a screen reader once", async () => {
    const { failed, runs } = failedRunWithLog();
    const started = vi
      .fn<(input: Record<string, unknown>) => Promise<{ runId: string }>>()
      .mockResolvedValueOnce({ runId: failed.id })
      .mockRejectedValueOnce(
        Object.assign(new Error("The workflow changed."), { kind: "invalid_input" }),
      );
    const announce = vi.fn();
    const { host } = memoryHost([], [], [reply], [], {
      startRun: async (_ref, input) => started(input),
    });
    const page = await show(
      <WorkflowScreen host={host} runs={runs.source} hubId="acme" id="reply" announce={announce} />,
    );

    await click(runButton(page));
    await click(buttonNamed(page, "Start run"));
    await click(buttonNamed(page, "Run again"));
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      "Couldn't start the run: the workflow changed.",
    );
  });

  it("shows the command that starts it in a terminal, with no Try again, when only a terminal can", async () => {
    const { page } = await open(async () => {
      throw new StartInTerminal({
        reason: "Reporter uses a connector, which Studio can't start yet.",
        lead: "To start it, run this in a terminal:",
        command: "halonic run reply",
      });
    });

    await click(runButton(page));
    await click(buttonNamed(page, "Start run"));

    expect(page.textContent).toContain(
      "Couldn't start the run: Reporter uses a connector, which Studio can't start yet.",
    );
    expect(page.textContent).toContain("To start it, run this in a terminal:");
    expect(page.textContent).not.toContain("terminal:.");
    expect(page.querySelector("aside code")?.textContent).toBe("halonic run reply");
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

verifies("inbox.needs-you-news", () => {
  it("notes the docked card's run in the Inbox while the card shows", async () => {
    const shownRuns = new ShownRuns();
    const runs = memoryRuns();
    const { host } = memoryHost([], [], [reply], [], {
      startRun: async () => ({ runId: "run_mfx3k2a1_01jd8q" }),
    });
    const page = await show(
      <WorkflowScreen
        host={host}
        runs={runs.source}
        hubId="acme"
        id="reply"
        shownRuns={shownRuns}
      />,
    );
    const workflowPage = { item: { kind: "workflow", hub: "acme", id: "reply" } };

    await click(runButton(page));
    await click(buttonNamed(page, "Start run"));
    await act(async () => {
      runs.change([runSummary({ status: "waiting", state: "draft" })]);
    });
    expect(shownRuns.saidOn("run_mfx3k2a1_01jd8q", workflowPage)).toBe(true);
    await click(
      page.querySelector<HTMLButtonElement>("button[aria-label='Stop showing this run']") ??
        undefined,
    );

    expect(shownRuns.saidOn("run_mfx3k2a1_01jd8q", workflowPage)).toBe(false);
  });
});
