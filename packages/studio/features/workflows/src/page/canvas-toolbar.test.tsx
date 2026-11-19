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

type Edits = Pick<WorkflowsHost, "addStep" | "resetLayout">;

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

const editsThatWork = (): Required<Edits> => ({
  addStep: vi.fn(async () => "step"),
  resetLayout: vi.fn(async () => {}),
});

verifies("workflows.canvas.toolbar", () => {
  it("has Step, Wait and Auto layout at the canvas's top left", async () => {
    const { page } = await showPage(editsThatWork());
    expect(
      [...(toolbar(page)?.querySelectorAll("button") ?? [])].map((one) => one.textContent),
    ).toEqual(["Step", "Wait", "Auto layout"]);
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

    await replace({ ...reply, steps: [...reply.steps, { id: "step", type: "task" }] });
    const added = [...page.querySelectorAll("button[aria-pressed]")].find(
      (card) => card.querySelector("[title]")?.textContent === "step",
    );
    expect(added?.getAttribute("aria-pressed")).toBe("true");
  });

  it("adds a wait step with Wait", async () => {
    const edits = editsThatWork();
    const { page } = await showPage(edits);
    await act(async () => buttonNamed(toolbar(page) as HTMLElement, "Wait")?.click());
    expect(edits.addStep).toHaveBeenCalledWith(expect.anything(), "wait", expect.anything());
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
