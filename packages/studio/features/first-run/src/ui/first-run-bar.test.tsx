// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
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

function renderBar(firstRun: FirstRun, presentation: "desktop" | "phone" = "desktop") {
  const context = { services: { get: () => firstRun } } as unknown as WorkspaceContext;
  return render(
    <PresentationProvider presentation={presentation}>
      <FirstRunBar context={context} />
    </PresentationProvider>,
  );
}

const railColours = (bar: HTMLElement) =>
  [...bar.querySelectorAll("[data-rail]")].map((rail) =>
    rail.classList.contains("bg-success") ? "success" : "border-strong",
  );

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

  it("joins the steps with rails, green after a done step, and none on a phone", () => {
    const bar = renderBar(firstRunOf(on("run")));
    expect(railColours(bar)).toEqual(["success", "success", "border-strong"]);
    expect(bar.querySelector("ol")?.classList.contains("gap-x-3")).toBe(false);
    const phone = renderBar(firstRunOf(on("run")), "phone");
    expect(phone.querySelectorAll("[data-rail]")).toHaveLength(0);
    expect(phone.querySelector("ol")?.classList.contains("gap-x-3")).toBe(true);
  });

  it("keeps the current dot and the tick and cross discs in high contrast", () => {
    const bar = renderBar(firstRunOf(on("run", { failed: true })));
    const discs = [...bar.querySelectorAll("li > span > span[aria-hidden]")];
    for (const disc of [discs[0], discs[2]]) {
      expect(disc?.className).toContain("forced-colors:border-[CanvasText]");
    }
    const current = renderBar(firstRunOf(on("demo")));
    const dot = current.querySelector("li span[aria-hidden] > span");
    expect(dot?.className).toContain("forced-color-adjust-none");
    expect(dot?.className).toContain("forced-colors:bg-[CanvasText]");
  });

  it("names its labels in medium weight, the steps to come muted", () => {
    const bar = renderBar(firstRunOf(on("model")));
    const labels = [...bar.querySelectorAll("li > span > span:not([aria-hidden])")].filter(
      (label) => !label.classList.contains("sr-only"),
    );
    expect(labels.map((label) => label.classList.contains("font-medium"))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(labels.map((label) => label.classList.contains("text-fg-muted"))).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });

  it("draws nothing outside the first run: another folder, off, or after the win", () => {
    expect(renderBar(firstRunOf(undefined, false)).childElementCount).toBe(0);
    expect(renderBar(firstRunOf(on("run"), true, "/docs/Other")).childElementCount).toBe(0);
    expect(renderBar(firstRunOf({ kind: "done", folder })).childElementCount).toBe(0);
  });
});

/** A page with the shell's main region, and an `h1` in it when `title` is given. */
function renderPage(title?: string): HTMLElement {
  const main = document.createElement("main");
  if (title !== undefined) {
    const heading = document.createElement("h1");
    heading.textContent = title;
    main.append(heading);
  }
  document.body.append(main);
  return main;
}

verifies("first-run.bar-skip-focus", () => {
  afterEach(() => {
    for (const main of document.querySelectorAll("main")) main.remove();
  });

  it("gives focus to the page's h1 when Skip, I'll explore goes with the bar", () => {
    const main = renderPage("Acme sample");
    const bar = renderBar(firstRunOf(undefined));
    const skip = bar.querySelector("button");
    skip?.focus();
    act(() => skip?.click());
    expect(bar.querySelector("section")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(main.querySelector("h1"));
  });

  it("gives focus to the main region when the page has no h1", () => {
    const main = renderPage();
    const bar = renderBar(firstRunOf(undefined));
    act(() => bar.querySelector("button")?.click());
    expect(document.activeElement).toBe(main);
    expect(main.tabIndex).toBe(-1);
  });
});
