// @vitest-environment jsdom
import type { SetupItem } from "@halonicjs/studio-feature-inbox/api";
import type { ItemRef } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { FirstRun } from "../first-run.ts";
import { firstRunSetupSource } from "../first-run-setup.ts";
import type { FirstRunState } from "../first-run-state.ts";
import { FirstRunSetupView } from "./first-run-setup-view.tsx";

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
const paused: FirstRunState = {
  kind: "paused",
  folder,
  since: "2026-11-21T09:00:00.000Z",
  step: "model",
};

function firstRunOf(saved: FirstRunState, here = folder) {
  let text: string | undefined = JSON.stringify(saved);
  const runs = {
    state: { runs: [], loaded: true, error: undefined, workflows: undefined },
    subscribe: () => () => {},
    source: { log: async () => [] },
  };
  const device = { folder: here, read: () => text, write: (next: string) => (text = next) };
  return new FirstRun(runs, { isSample: () => true }, device, () => new Date(0));
}

const item: SetupItem = {
  kind: "setup",
  key: "setup:first-run:demo",
  provider: "first-run",
  account: "demo",
  title: "Finish your first run",
  progress: "Step 2 of 4 · Model",
  changedAt: paused.kind === "paused" ? paused.since : "",
};

const button = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll("button")].find((each) => each.textContent === name) as HTMLElement;

verifies("first-run.setup-item", () => {
  it("lists Finish your first run at its step while paused here, and nothing otherwise", async () => {
    expect(await firstRunSetupSource(firstRunOf(paused)).list()).toEqual([
      {
        account: "demo",
        title: "Finish your first run",
        progress: "Step 2 of 4 · Model",
        changedAt: item.changedAt,
      },
    ]);
    const on: FirstRunState = { kind: "on", folder, since: "", step: "demo" };
    expect(await firstRunSetupSource(firstRunOf(on)).list()).toEqual([]);
    expect(await firstRunSetupSource(firstRunOf(paused, "/docs/Other")).list()).toEqual([]);
    expect(await firstRunSetupSource(firstRunOf({ kind: "done", folder })).list()).toEqual([]);
  });

  it("tells the Inbox when the item may have changed", () => {
    const firstRun = firstRunOf(paused);
    const changed = vi.fn();
    firstRunSetupSource(firstRun).subscribe(changed);
    firstRun.send({ kind: "resumed" });
    expect(changed).toHaveBeenCalledOnce();
  });

  it("shows the title with focus, the progress up to the step, and Continue and Dismiss", () => {
    const root = render(
      <FirstRunSetupView item={item} answering close={() => {}} firstRun={firstRunOf(paused)} />,
    );
    expect(document.activeElement?.textContent).toBe("Finish your first run");
    const pieces = [...root.querySelectorAll("[aria-hidden=true] > span")];
    expect(pieces.map((piece) => piece.classList.contains("bg-accent"))).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(root.textContent).toContain("Step 2 of 4 · Model");
    expect([...root.querySelectorAll("button")].map((each) => each.textContent)).toEqual([
      "Continue",
      "Dismiss",
    ]);
  });

  // C564: unfilled pieces were the Inbox's own canvas colour, so at Step 1 the line didn't show.
  it("shows all four pieces, the current one apart, in every theme and in high contrast", () => {
    const root = render(
      <FirstRunSetupView item={item} answering close={() => {}} firstRun={firstRunOf(paused)} />,
    );
    const pieces = [...root.querySelectorAll("[aria-hidden=true] > span")];
    const fills = pieces.map((piece) =>
      ["bg-accent", "bg-linear-to-r", "bg-border"].find((fill) => piece.classList.contains(fill)),
    );
    expect(fills).toEqual(["bg-accent", "bg-linear-to-r", "bg-border", "bg-border"]);
    for (const piece of pieces) {
      expect(piece.className).not.toContain("bg-surface-muted");
      expect(piece.className).toContain("forced-color-adjust-none");
    }
    expect(pieces[0]?.className).toContain("forced-colors:bg-[CanvasText]");
    expect(pieces[1]?.className).toContain("forced-colors:from-[Highlight]");
    expect(pieces[2]?.className).toContain("forced-colors:border-[CanvasText]");
  });

  // C587: the current piece was a tint of the accent, about 1:1 against the later pieces.
  it("fills the current piece half with the accent, not a tint, in every theme and in high contrast", () => {
    const root = render(
      <FirstRunSetupView item={item} answering close={() => {}} firstRun={firstRunOf(paused)} />,
    );
    const current = [...root.querySelectorAll("[aria-hidden=true] > span")][1]?.classList;
    expect(current?.contains("bg-accent-soft")).toBe(false);
    for (const stop of ["bg-origin-border", "from-accent", "from-[50%]", "to-border", "to-[50%]"]) {
      expect(current?.contains(stop)).toBe(true);
    }
    for (const edge of ["forced-colors:from-[Highlight]", "forced-colors:to-[Canvas]"]) {
      expect(current?.contains(edge)).toBe(true);
    }
    expect(current?.contains("forced-colors:border-[CanvasText]")).toBe(true);
  });

  it("takes the first run up again and opens Support reply on Continue", () => {
    const firstRun = firstRunOf(paused);
    const opened: ItemRef[] = [];
    const root = render(
      <FirstRunSetupView
        item={item}
        answering
        close={() => {}}
        firstRun={firstRun}
        openItem={(ref) => opened.push(ref)}
      />,
    );
    act(() => button(root, "Continue").click());
    expect(firstRun.state).toMatchObject({ kind: "on", step: "model" });
    expect(opened).toEqual([{ kind: "workflow", hub: "support", id: "support-reply" }]);
  });

  it("closes the item and leaves the first run for good on Dismiss", () => {
    const firstRun = firstRunOf(paused);
    const close = vi.fn();
    const root = render(
      <FirstRunSetupView item={item} answering close={close} firstRun={firstRun} />,
    );
    act(() => button(root, "Dismiss").click());
    expect(close).toHaveBeenCalledOnce();
    expect(firstRun.state).toEqual({ kind: "dismissed", folder });
  });
});
