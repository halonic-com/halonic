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

afterEach(unmountAll);

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
    openModels?: () => void;
  } = {},
) {
  const log = logOf(run.id, [
    [0, entered("draft")],
    [0, modelCall],
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

  it("opens the budget from a budget stop's banner", async () => {
    let opened = 0;
    const root = await openOn("desktop", stopped, { openModels: () => opened++ });
    expect(root.textContent).toContain("Change the budget, then run again.");
    await act(async () => button(root, "Change budget")?.click());
    expect(opened).toBe(1);
  });

  it("leaves out Change budget where the page can't open Models", async () => {
    const root = await openOn("desktop", stopped);
    expect(button(root, "Change budget")).toBeUndefined();
  });
});

verifies("runs.run-view.slow-step-line", () => {
  it("draws the line when the step turns 10 seconds quiet, without a new event", async () => {
    const run = summaryWith({ id: "run_b_01jd8q", state: "draft", statesVisited: ["draft"] });
    const log = logOf(run.id, [
      [0, entered("draft")],
      [0, modelCall],
    ]);
    const list = new RunsList(fakeSource([run], { [run.id]: log }).source);
    let clock = mondayMorning.getTime() + 9_950;
    const root = render(<RunView list={list} runId={run.id} now={() => new Date(clock)} />);
    await settled();
    expect(root.textContent).not.toContain(
      "Waiting for Ollama. The first answer can take a minute while it loads the model.",
    );
    clock = mondayMorning.getTime() + 10_000;
    // The page redraws on its own timer; wait for it instead of guessing how long a loaded runner takes.
    await vi.waitFor(
      async () => {
        await settled(20);
        expect(root.textContent).toContain(
          "Waiting for Ollama. The first answer can take a minute while it loads the model.",
        );
      },
      { timeout: 5_000 },
    );
  });
});
