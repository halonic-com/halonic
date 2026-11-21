// @vitest-environment jsdom
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { FirstRun } from "../first-run.ts";
import { barSteps, barWayOut } from "../first-run-bar.ts";
import type { FirstRunState } from "../first-run-state.ts";
import { FirstRunBar } from "./first-run-bar.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

function render(element: ReactNode): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => root.render(element));
  return container;
}

const folder = "/docs/Acme sample";
const on = (step: Extract<FirstRunState, { kind: "on" }>["step"], extra = {}) =>
  ({ kind: "on", folder, since: "", step, ...extra }) as Extract<FirstRunState, { kind: "on" }>;

/** The first run of a folder, from a saved state; `sample` says whether the folder is the demo. */
function firstRunOf(saved: FirstRunState | undefined, sample = true, here = folder) {
  let text = saved === undefined ? undefined : JSON.stringify(saved);
  const runs = {
    state: { runs: [], loaded: true, error: undefined, workflows: undefined },
    subscribe: () => () => {},
    source: { log: async () => [] },
  };
  const device = { folder: here, read: () => text, write: (next: string) => (text = next) };
  return new FirstRun(runs, { isSample: () => sample }, device, () => new Date(0));
}

function renderBar(firstRun: FirstRun) {
  const context = { services: { get: () => firstRun } } as unknown as WorkspaceContext;
  return render(<FirstRunBar context={context} />);
}

const stepText = (bar: HTMLElement) =>
  [...bar.querySelectorAll("li")].map((item) => item.textContent);

verifies("first-run.bar", () => {
  describe("the strip", () => {
    it("ticks the steps before the current one and rings the current one", () => {
      expect(barSteps(on("run")).map((step) => step.mark)).toEqual([
        "done",
        "done",
        "current",
        "todo",
      ]);
    });

    it("crosses a failed Run, and makes Approve current while the run waits", () => {
      expect(barSteps(on("run", { failed: true })).map((step) => step.mark)).toEqual([
        "done",
        "done",
        "failed",
        "todo",
      ]);
      expect(barSteps(on("approve")).at(3)?.mark).toBe("current");
    });

    it("offers Skip, I'll explore on the demo screen only, until the other ways out are built", () => {
      expect(barWayOut(on("demo"))).toBe("skip");
      expect(barWayOut(on("run"))).toBeUndefined();
    });
  });

  it("shows the strip and Skip in the demo, numbered, the current step marked for a screen reader", () => {
    const bar = renderBar(firstRunOf(undefined));
    const region = bar.querySelector("section");
    expect(region?.getAttribute("aria-label")).toBe("First run");
    expect(stepText(bar)).toEqual(["1 Demo", "2 Model", "3 Run", "4 Approve"]);
    expect(bar.querySelector("[aria-current=step]")?.textContent).toBe("1 Demo");
    expect(bar.querySelector("button")?.textContent).toBe("Skip, I'll explore");
  });

  it("reads done and failed after a step's name", () => {
    const bar = renderBar(firstRunOf(on("run", { failed: true })));
    expect(stepText(bar)).toEqual(["1 Demo, done", "2 Model, done", "3 Run, failed", "4 Approve"]);
    expect(bar.querySelector("button")).toBeNull();
  });

  it("goes when Skip, I'll explore pauses the first run", () => {
    const firstRun = firstRunOf(undefined);
    const bar = renderBar(firstRun);
    act(() => bar.querySelector("button")?.click());
    expect(firstRun.state).toMatchObject({ kind: "paused", step: "demo" });
    expect(bar.querySelector("section")).toBeNull();
  });

  it("draws nothing outside the first run: another folder, off, or after the win", () => {
    expect(renderBar(firstRunOf(undefined, false)).childElementCount).toBe(0);
    expect(renderBar(firstRunOf(on("run"), true, "/docs/Other")).childElementCount).toBe(0);
    expect(renderBar(firstRunOf({ kind: "done", folder })).childElementCount).toBe(0);
  });
});
