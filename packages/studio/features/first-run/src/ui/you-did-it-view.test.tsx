// @vitest-environment jsdom
import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { WaitItem } from "@halonicjs/studio-feature-inbox/api";
import type { RunsList } from "@halonicjs/studio-feature-runs/api";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { YouDidItView } from "./you-did-it-view.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

async function render(element: ReactNode): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(element));
  return container;
}

const item = { kind: "wait", runId: "run_1", title: "Approve this reply?" } as WaitItem;

function finished(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: "run_1",
    status: "completed",
    startedAt: "2026-11-21T09:01:00.000Z",
    endedAt: "2026-11-21T09:01:14.000Z",
    statesVisited: ["sort", "write", "review"],
    cost: 0,
    unpricedCalls: 0,
    ...overrides,
  } as RunSummary;
}

/** The runs list in memory, its one run's model calls going to `provider`. */
function runsWith(provider: string, summary?: RunSummary) {
  const listeners = new Set<() => void>();
  let state = {
    runs: summary === undefined ? [] : [{ summary }],
    loaded: true,
    error: undefined,
    workflows: undefined,
  } as RunsList["state"];
  const log = [
    { type: "llm.request", provider } as unknown as RunEvent,
    { type: "run.completed" } as unknown as RunEvent,
  ];
  const runs = {
    get state() {
      return state;
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    source: {
      log: async () => log,
      providerKind: (id: string) => (id === "anthropic" ? "cloud" : "local"),
      isTestModel: (id: string) => id === "mock",
      currency: () => "EUR",
    } as unknown as RunsList["source"],
    show(next: RunSummary) {
      state = { ...state, runs: [{ summary: next } as RunsList["state"]["runs"][number]] };
      for (const listener of [...listeners]) listener();
    },
  };
  return runs;
}

const text = (root: HTMLElement) => root.textContent ?? "";
const button = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll("button")].find((each) => each.textContent === name);

verifies("first-run.you-did-it", () => {
  it("takes focus on its title and shows the run's numbers on a model on this computer", async () => {
    const root = await render(
      <YouDidItView item={item} runs={runsWith("ollama", finished())} close={() => {}} />,
    );
    expect(document.activeElement?.textContent).toContain("Your first run is done.");
    expect(text(root)).toContain(
      "3 steps · 14 s · no cost, ran on this computer · logged with your yes",
    );
    expect(text(root)).toContain(
      "Later: connect Gmail or Google Drive. About 15 minutes, once. It's in Settings when you want it.",
    );
  });

  it("waits for the runs list to have the run finished before it shows numbers", async () => {
    const runs = runsWith("ollama", finished({ status: "waiting", endedAt: null }));
    const root = await render(<YouDidItView item={item} runs={runs} close={() => {}} />);
    expect(text(root)).toContain("Reading the run…");
    expect(text(root)).not.toContain("steps");
    // "What next?" comes with its list, not on its own while the run is read.
    expect(text(root)).not.toContain("What next?");
    await act(async () => runs.show(finished()));
    expect(text(root)).toContain("3 steps · 14 s");
  });

  it("on Sample answers drops the cost part, says so, and offers Pick a model first", async () => {
    const openItem = vi.fn();
    const root = await render(
      <YouDidItView
        item={item}
        runs={runsWith("mock", finished())}
        close={() => {}}
        openItem={openItem}
      />,
    );
    expect(text(root)).toContain("3 steps · 14 s · logged with your yes");
    expect(text(root)).toContain("Sample answers. Add a key or a local model to use a real model.");
    expect(button(root, "Run it again with your own message")).toBeUndefined();
    button(root, "Pick a model")?.click();
    expect(openItem.mock.calls).toEqual([
      [{ kind: "model-alias", hub: "local", id: "default" }, undefined],
    ]);
  });

  it("with a key shows the run's cost, and Run it again opens Support reply's Run form", async () => {
    const openItem = vi.fn();
    const close = vi.fn();
    const root = await render(
      <YouDidItView
        item={item}
        runs={runsWith("anthropic", finished({ cost: 0.02 }))}
        close={close}
        openItem={openItem}
      />,
    );
    expect(text(root)).toContain("3 steps · 14 s · estimated cost €0.02 · logged with your yes");
    expect(button(root, "Pick a model")).toBeUndefined();
    button(root, "Run it again with your own message")?.click();
    button(root, "Change what the agents do")?.click();
    const supportReply = { kind: "workflow", hub: "support", id: "support-reply" };
    expect(text(root)).toContain("What next?");
    expect(openItem.mock.calls).toEqual([
      [supportReply, { step: "run" }],
      [supportReply, undefined],
    ]);
    button(root, "Close")?.click();
    expect(close).toHaveBeenCalledOnce();
  });
});

/** Quick ask's keys as the feedback feature names them, changed with `set`. */
function askKeysNamed(keys: string | undefined) {
  let current = keys;
  const listeners = new Set<() => void>();
  return {
    current: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next: string | undefined) {
      current = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

verifies("first-run.you-did-it-quick-ask", () => {
  it("ends What next? with quick ask's keys while they work", async () => {
    const askKeys = askKeysNamed("Ctrl+Alt+Space");
    const root = await render(
      <YouDidItView
        item={item}
        runs={runsWith("ollama", finished())}
        askKeys={askKeys}
        close={() => {}}
        openItem={() => {}}
      />,
    );
    const lines = [...root.querySelectorAll("li")].map((each) => each.textContent);
    expect(lines.at(-1)).toBe("Ask an agent from any app: Ctrl+Alt+Space");

    await act(async () => askKeys.set("⌥Space"));
    expect(text(root)).toContain("Ask an agent from any app: ⌥Space");
  });

  it("leaves the line out while the keys don't work, and without them", async () => {
    const askKeys = askKeysNamed(undefined);
    const root = await render(
      <YouDidItView
        item={item}
        runs={runsWith("ollama", finished())}
        askKeys={askKeys}
        close={() => {}}
        openItem={() => {}}
      />,
    );
    expect(text(root)).toContain("What next?");
    expect(text(root)).not.toContain("Ask an agent from any app");

    const without = await render(
      <YouDidItView
        item={item}
        runs={runsWith("ollama", finished())}
        close={() => {}}
        openItem={() => {}}
      />,
    );
    expect(text(without)).not.toContain("Ask an agent from any app");
  });
});
