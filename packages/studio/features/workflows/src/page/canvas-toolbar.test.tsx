// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { WorkflowsHost, WorkflowView } from "../api.ts";
import { buttonNamed, memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { newStepPlace } from "./canvas-toolbar.tsx";
import { reply } from "./page-fixtures.ts";
import { WorkflowScreen } from "./workflow-page.tsx";

afterEach(unmount);

type Edits = Pick<WorkflowsHost, "addStep" | "resetLayout" | "changeStep">;

/** The page of `view` on a host with `edits`; `views[0]` can be swapped and `change` tells the page. */
async function showPage(edits: Partial<Edits>, view: WorkflowView = reply, phone = false) {
  const views = [view];
  const { host, change } = memoryHost([], [], views, [], edits);
  const toasts = createToastStore();
  const screen = (
    <ToastStoreProvider store={toasts}>
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />
    </ToastStoreProvider>
  );
  const page = await show(
    phone ? <PresentationProvider presentation="phone">{screen}</PresentationProvider> : screen,
  );
  const replace = async (next: WorkflowView) => {
    views[0] = next;
    await act(async () => change([]));
  };
  return { page, toasts, replace };
}

const toolbar = (page: HTMLElement) => page.querySelector("[role=group][aria-label='Flow tools']");

/** A button's text without the parts that match `leaveOut`: what shows, or what a screen reader hears. */
function textOf(button: HTMLElement, leaveOut: string): string {
  const copy = button.cloneNode(true) as HTMLElement;
  for (const part of copy.querySelectorAll(leaveOut)) part.remove();
  return copy.textContent ?? "";
}

const editsThatWork = (): Required<Omit<Edits, "changeStep">> => ({
  addStep: vi.fn(async () => "step-1"),
  resetLayout: vi.fn(async () => {}),
});

/** Where a card's right edge shows on screen, read back from the canvas's transform. */
function shownRight(page: HTMLElement, card: HTMLElement): number {
  const transform =
    page.querySelector<HTMLElement>("[data-testid=canvas-surface]")?.style.transform ?? "";
  const [x = 0, , zoom = 1] = (transform.match(/-?[\d.]+/g) ?? []).map(Number);
  return (Number.parseFloat(card.style.left) + Number.parseFloat(card.style.width)) * zoom + x;
}

verifies("workflows.canvas.toolbar", () => {
  it("has Step, Wait and Auto layout at the canvas's top left, heard as what they do, and a divider high contrast keeps", async () => {
    const { page } = await showPage(editsThatWork());
    const buttons = [...(toolbar(page)?.querySelectorAll("button") ?? [])];
    expect(buttons.map((one) => textOf(one, ".sr-only"))).toEqual(["Step", "Wait", "Auto layout"]);
    expect(buttons.map((one) => textOf(one, "[aria-hidden=true]"))).toEqual([
      "Add step",
      "Add wait",
      "Auto layout",
    ]);
    // Forced colours drop backgrounds, so the divider takes the text's colour there.
    const divider = toolbar(page)?.querySelector(":scope > [aria-hidden=true]");
    expect(divider?.className).toContain("forced-colors:bg-[CanvasText]");
  });

  it("adds a step right of the right-most card and selects it once it shows", async () => {
    const edits = editsThatWork();
    const { page, replace } = await showPage(edits);

    await act(async () => buttonNamed(toolbar(page) as HTMLElement, "Step")?.click());
    expect(edits.addStep).toHaveBeenCalledWith(
      { hubId: "acme", id: "reply" },
      "task",
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );

    await replace({ ...reply, steps: [...reply.steps, { id: "step-1", type: "task" }] });
    const added = [...page.querySelectorAll("button[aria-pressed]")].find(
      (card) => card.querySelector("[title]")?.textContent === "step-1",
    );
    expect(added?.getAttribute("aria-pressed")).toBe("true");
  });

  it("adds a wait step with Wait", async () => {
    const edits = editsThatWork();
    const { page } = await showPage(edits);
    await act(async () => buttonNamed(toolbar(page) as HTMLElement, "Wait")?.click());
    expect(edits.addStep).toHaveBeenCalledWith(expect.anything(), "wait", expect.anything());
  });

  it("opens the new step's card with focus, and at 200 % pans the step clear of it", async () => {
    const edits = {
      ...editsThatWork(),
      addStep: vi.fn<NonNullable<Edits["addStep"]>>(async () => "wait-2"),
    };
    const { page, replace } = await showPage({ ...edits, changeStep: async () => {} });
    const zoomIn = page.querySelector<HTMLButtonElement>("button[aria-label='Zoom in']");
    for (let press = 0; press < 4; press++) await act(async () => zoomIn?.click());

    await act(async () => buttonNamed(toolbar(page) as HTMLElement, "Wait")?.click());
    const place = edits.addStep.mock.calls[0]?.[2];
    if (place === undefined) throw new Error("no step added");
    await replace({
      ...reply,
      steps: [...reply.steps, { id: "wait-2", type: "wait" }],
      layout: { "wait-2": place },
    });

    const title = page.querySelector("aside h2");
    expect(title?.textContent).toBe("Step wait-2");
    expect(document.activeElement).toBe(title);
    const added = [...page.querySelectorAll<HTMLElement>("button[aria-pressed]")].find(
      (card) => card.querySelector("[title]")?.textContent === "wait-2",
    );
    if (added === undefined) throw new Error("no card for wait-2");
    // jsdom measures the canvas as the 800 pixels it falls back to.
    expect(shownRight(page, added)).toBeLessThanOrEqual(800 - 16);
  });

  it("forgets the saved places with Auto layout, and asks nothing when there are none", async () => {
    const placedEdits = editsThatWork();
    const placed = await showPage(placedEdits, { ...reply, layout: { done: { x: 0, y: 400 } } });
    await act(async () => buttonNamed(toolbar(placed.page) as HTMLElement, "Auto layout")?.click());
    expect(placedEdits.resetLayout).toHaveBeenCalledWith({ hubId: "acme", id: "reply" });
    unmount();

    const edits = editsThatWork();
    const { page } = await showPage(edits);
    await act(async () => buttonNamed(toolbar(page) as HTMLElement, "Auto layout")?.click());
    expect(edits.resetLayout).not.toHaveBeenCalled();
  });

  it("says why on a toast when the host can't change the workflow", async () => {
    const { page, toasts } = await showPage({
      addStep: async () => {
        throw new KindedError("invalid_input", "This workflow's file couldn't be changed.");
      },
      resetLayout: async () => {},
    });
    await act(async () => buttonNamed(toolbar(page) as HTMLElement, "Step")?.click());
    expect(toasts.list()[0]).toMatchObject({
      tone: "danger",
      title: "Couldn't change Support reply",
      text: "This workflow's file couldn't be changed.",
    });
  });

  it("has no toolbar where the host can't add steps, nor on a phone", async () => {
    expect(toolbar((await showPage({})).page)).toBeNull();
    unmount();
    expect(toolbar((await showPage(editsThatWork(), reply, true)).page)).toBeNull();
  });
});

verifies("workflows.canvas.toolbar", () => {
  it("places a new step right of the right-most card, level with it, on the 20px grid", () => {
    const card = { width: 200, height: 72 };
    expect(
      newStepPlace([
        { x: 0, y: 0, ...card },
        { x: 248, y: 133, ...card },
        { x: 100, y: 300, ...card },
      ]),
    ).toEqual({ x: 500, y: 140 });
    expect(newStepPlace([])).toEqual({ x: 0, y: 0 });
  });
});
