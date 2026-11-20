// @vitest-environment jsdom
import {
  ClipboardProvider,
  COMMAND_COPIED,
  COMMAND_NOT_COPIED,
  createToastStore,
  PresentationProvider,
  type ToastStore,
  ToastStoreProvider,
} from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { entered, logOf } from "./run-log.test-helper.ts";
import { RunView } from "./run-page.tsx";

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

const modelCall = {
  type: "llm.request",
  agent: "reporter",
  provider: "ollama",
  model: "llama3.1:70b",
  messages: 1,
} as const;

async function settled(milliseconds = 0): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  });
}

async function openOn(
  presentation: "desktop" | "phone",
  run: ReturnType<typeof summaryWith>,
  hooks: {
    copied?: string[];
    refuseCopy?: boolean;
    toasts?: ToastStore;
    openModels?: (alias?: string) => void;
    alias?: string;
    runAgain?: boolean;
    openBudget?: () => void;
  } = {},
) {
  const log = logOf(run.id, [
    [0, entered("draft")],
    [0, hooks.alias === undefined ? modelCall : { ...modelCall, alias: hooks.alias }],
  ]);
  const list = new RunsList(fakeSource([run], { [run.id]: log }).source);
  const root = render(
    <ClipboardProvider
      writeClipboard={async (text) => {
        hooks.copied?.push(text);
        return hooks.refuseCopy !== true;
      }}
    >
      <ToastStoreProvider store={hooks.toasts ?? createToastStore()}>
        <PresentationProvider presentation={presentation}>
          <RunView
            list={list}
            runId={run.id}
            now={() => mondayMorning}
            {...(hooks.openModels === undefined ? {} : { openModels: hooks.openModels })}
            {...(hooks.openBudget === undefined ? {} : { openBudget: hooks.openBudget })}
            {...(hooks.runAgain === true && {
              runStart: { startRun: async () => ({ runId: "run_new" }) },
              openRun: () => {},
            })}
          />
        </PresentationProvider>
      </ToastStoreProvider>
    </ClipboardProvider>,
  );
  await settled();
  return root;
}

verifies("runs.run-view.failure-banners", () => {
  const outOfMemory = summaryWith({
    id: "run_a_7k2m9p",
    status: "failed",
    reason: "model-out-of-memory",
    state: "draft",
    endedAt: mondayMorning.toISOString(),
  });

  it("fixes it in Models on a computer", async () => {
    const root = await openOn("desktop", outOfMemory);
    expect(root.textContent).toContain("Close other programs, or pick a smaller model in Models.");
    expect(root.textContent).not.toContain("Fix this on your computer");
  });

  it("tells a phone to fix it on the computer, because the page passes it that it is one", async () => {
    const root = await openOn("phone", outOfMemory);
    expect(root.textContent).toContain("Close other programs, or pick a smaller model.");
    expect(root.textContent).toContain("Fix this on your computer: Models");
  });
});

verifies("runs.run-view.failure-banners", () => {
  const missing = summaryWith({
    id: "run_c_4n8x2q",
    status: "failed",
    reason: "model-missing",
    state: "draft",
    endedAt: mondayMorning.toISOString(),
  });
  const button = (root: HTMLElement, name: string) =>
    [...root.querySelectorAll("button")].find((candidate) => candidate.textContent === name);

  it("copies the pull command and opens Models from a missing model's banner", async () => {
    const copied: string[] = [];
    let opened = 0;
    const root = await openOn("desktop", missing, { copied, openModels: () => opened++ });
    await act(async () => button(root, "Copy command")?.click());
    await act(async () => button(root, "Open Models")?.click());
    expect(copied).toEqual(["ollama pull llama3.1:70b"]);
    expect(opened).toBe(1);
  });

  it("confirms the copy with a Copied toast", async () => {
    const toasts = createToastStore();
    const root = await openOn("desktop", missing, { toasts });
    await act(async () => button(root, "Copy command")?.click());
    expect(toasts.list()).toMatchObject([{ tone: "success", title: COMMAND_COPIED }]);
  });

  it("says to copy it by hand when the clipboard refuses", async () => {
    const toasts = createToastStore();
    const root = await openOn("desktop", missing, { toasts, refuseCopy: true });
    await act(async () => button(root, "Copy command")?.click());
    expect(toasts.list()).toMatchObject([{ tone: "warning", title: COMMAND_NOT_COPIED }]);
  });

  it("puts Run again first and Open Models after it, as 15.3 says (R3)", async () => {
    const root = await openOn("desktop", missing, { openModels: () => {}, runAgain: true });
    const names = [...root.querySelectorAll('section[aria-label="Run failed"] button')].map(
      (candidate) => candidate.textContent,
    );
    expect(names).toEqual(["Copy command", "Run again", "Open Models"]);
  });

  it("leaves out Open Models where the page can't open it", async () => {
    const root = await openOn("desktop", missing);
    expect(button(root, "Copy command")).toBeDefined();
    expect(button(root, "Open Models")).toBeUndefined();
  });
});

verifies("runs.run-view.failure-banners", () => {
  const stopped = summaryWith({
    id: "run_d_8q3v5t",
    status: "failed",
    reason: "budget",
    state: "draft",
    error: "Run budget reached: 0.52 of 0.50 EUR spent.",
    cause: {
      kind: "limit_reached",
      code: "budget.run",
      detail: { limit: "0.5", spent: "0.52", currency: "EUR" },
    },
    endedAt: mondayMorning.toISOString(),
  });
  const button = (root: HTMLElement, name: string) =>
    [...root.querySelectorAll("button")].find((candidate) => candidate.textContent === name);

  it("opens the Budget block, not Models, from a budget stop's banner", async () => {
    const openBudget = vi.fn();
    const openModels = vi.fn();
    const root = await openOn("desktop", stopped, { openBudget, openModels });
    expect(root.textContent).toContain("Change the budget, then run again.");
    await act(async () => button(root, "Change budget")?.click());
    expect(openBudget).toHaveBeenCalledOnce();
    expect(openModels).not.toHaveBeenCalled();
  });

  it("leaves out Change budget where the page can't open the budget", async () => {
    const root = await openOn("desktop", stopped, { openModels: vi.fn() });
    expect(button(root, "Change budget")).toBeUndefined();
  });
});

verifies("runs.run-view.slow-step-line", () => {
  const waiting = "Waiting for Ollama on this computer";
  const reason = "It loads the model first, so the start is slow.";

  /** The run page on a step that has waited on Ollama since `mondayMorning`, at `clock` ms in. */
  async function openWaiting(start: number, checkThisComputer?: () => void) {
    const run = summaryWith({ id: "run_b_01jd8q", state: "draft", statesVisited: ["draft"] });
    const log = logOf(run.id, [
      [0, entered("draft")],
      [0, modelCall],
    ]);
    const list = new RunsList(fakeSource([run], { [run.id]: log }).source);
    const time = { clock: mondayMorning.getTime() + start };
    // Fake timers: the page's 50 ms redraw timer must not fire before the test moves its clock,
    // which a real timer on a loaded runner can (HAL-12925).
    vi.useFakeTimers();
    const root = render(
      <RunView
        list={list}
        runId={run.id}
        now={() => new Date(time.clock)}
        {...(checkThisComputer === undefined ? {} : { checkThisComputer })}
      />,
    );
    await act(async () => vi.advanceTimersByTimeAsync(0));
    return { root, time };
  }

  const button = (root: HTMLElement, name: string) =>
    [...root.querySelectorAll("button")].find((candidate) => candidate.textContent === name);
  const statusOf = (root: HTMLElement) =>
    [...root.querySelectorAll('[role="status"]')].map((status) => status.textContent).join("|");

  it("draws the waiting line when the step turns 2 seconds quiet, without a new event", async () => {
    const { root, time } = await openWaiting(1_950);
    expect(root.textContent).not.toContain(waiting);
    time.clock = mondayMorning.getTime() + 2_000;
    await act(async () => vi.advanceTimersByTimeAsync(50));
    expect(statusOf(root)).toContain(waiting);
    expect(root.textContent).toContain("2 s");
    expect(root.textContent).not.toContain(reason);
  });

  it("adds the reason for a model on this computer at 10 seconds", async () => {
    const { root, time } = await openWaiting(9_000);
    expect(root.textContent).not.toContain(reason);
    time.clock = mondayMorning.getTime() + 10_000;
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(statusOf(root)).toContain(`${waiting}${reason}`);
    expect(root.textContent).toContain("10 s");
  });

  it("offers Something wrong? after 10 seconds only where Check this computer can open", async () => {
    const without = await openWaiting(12_000);
    expect(button(without.root, "Something wrong?")).toBeUndefined();
    unmountAll();
    let opened = 0;
    const withCheck = await openWaiting(12_000, () => opened++);
    await act(async () => button(withCheck.root, "Something wrong?")?.click());
    expect(opened).toBe(1);
  });
});

verifies("runs.run-view.failure-banners", () => {
  const noTools = summaryWith({
    id: "run_e_2k7w4r",
    status: "failed",
    reason: "model-no-tools",
    state: "draft",
    endedAt: mondayMorning.toISOString(),
  });
  const names = (root: HTMLElement) =>
    [...root.querySelectorAll('section[aria-label="Run failed"] button')].map(
      (candidate) => candidate.textContent,
    );

  it("opens the alias's tab, before Run again, for a model that can't use tools (R4)", async () => {
    const opened: (string | undefined)[] = [];
    const root = await openOn("desktop", noTools, {
      alias: "fast",
      openModels: (alias) => opened.push(alias),
      runAgain: true,
    });
    expect(names(root)).toEqual(["Open Models", "Run again"]);
    await act(async () =>
      [...root.querySelectorAll("button")]
        .find((candidate) => candidate.textContent === "Open Models")
        ?.click(),
    );
    expect(opened).toEqual(["fast"]);
  });
});
