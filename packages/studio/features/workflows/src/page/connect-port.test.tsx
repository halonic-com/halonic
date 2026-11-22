// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { WorkflowsHost, WorkflowView } from "../api.ts";
import { memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { reply } from "./page-fixtures.ts";
import { WorkflowScreen } from "./workflow-page.tsx";

afterEach(unmount);

type Edits = Pick<WorkflowsHost, "addStep" | "resetLayout" | "changeArrows">;

/**
 * Support reply (`start` → `write` → `done`), or `workflow`, on a host with `edits`, on a desktop
 * or a phone.
 */
async function showPage(edits: Partial<Edits>, phone = false, workflow: WorkflowView = reply) {
  const { host } = memoryHost([], [], [workflow], [], edits);
  const toasts = createToastStore();
  const announce = vi.fn();
  const screen = (
    <ToastStoreProvider store={toasts}>
      <WorkflowScreen
        host={host}
        runs={memoryRuns().source}
        hubId="acme"
        id="reply"
        announce={announce}
      />
    </ToastStoreProvider>
  );
  const page = await show(
    phone ? <PresentationProvider presentation="phone">{screen}</PresentationProvider> : screen,
  );
  return { page, toasts, announce };
}

const editsThatWork = () => ({
  addStep: vi.fn(async () => "step"),
  resetLayout: vi.fn(async () => {}),
  changeArrows: vi.fn<NonNullable<WorkflowsHost["changeArrows"]>>(async () => {}),
});

function card(page: HTMLElement, stepId: string): HTMLElement {
  const found = page.querySelector<HTMLElement>(`button[data-step='${stepId}']`);
  if (found === null) throw new Error(`No card for ${stepId}`);
  return found;
}

/** A step's port, or `null` when it has none. */
const portOf = (page: HTMLElement, stepId: string) =>
  page.querySelector<HTMLElement>(`[data-connect-port='${stepId}']`);

/** The middle of a step's card in screen pixels, from its place and the surface's zoom and pan. */
function middleOf(page: HTMLElement, stepId: string) {
  const surface = page.querySelector<HTMLElement>("[data-testid=canvas-surface]");
  const [x, y, zoom] = (surface?.style.transform.match(/-?[\d.]+/g) ?? []).map(Number);
  const { left, top, width, height } = card(page, stepId).style;
  return {
    clientX: (Number.parseFloat(left) + Number.parseFloat(width) / 2) * (zoom ?? 1) + (x ?? 0),
    clientY: (Number.parseFloat(top) + Number.parseFloat(height) / 2) * (zoom ?? 1) + (y ?? 0),
  };
}

const pointer = (type: string, at: { clientX: number; clientY: number }) =>
  new MouseEvent(type, { bubbles: true, ...at });

/** Presses `from`'s port and moves the pointer to `to`, without letting go. */
async function dragTo(page: HTMLElement, from: string, to: { clientX: number; clientY: number }) {
  const port = portOf(page, from) as HTMLElement;
  await act(async () => {
    port.dispatchEvent(pointer("pointerdown", middleOf(page, from)));
    port.dispatchEvent(pointer("pointermove", to));
  });
  return port;
}

async function drop(port: HTMLElement, at: { clientX: number; clientY: number }) {
  await act(async () => port.dispatchEvent(pointer("pointerup", at)));
}

const targets = (page: HTMLElement) =>
  Object.fromEntries(
    ["start", "write", "done"].map((id) => [id, card(page, id).dataset["connectTarget"]]),
  );

/** Support reply's steps with titles, so their cards show those instead of the ids. */
const titledSteps: WorkflowView["steps"] = [
  { id: "start", type: "task", title: "Start" },
  { id: "write", type: "task", title: "Write", agent: "writer" },
  { id: "done", type: "final", title: "Done" },
];
const refund = { equals: ["{{context.kind}}", "refund"] };

verifies("workflows.canvas.drag-to-connect", () => {
  it("draws a port with its tooltip on every step but the end", async () => {
    const { page } = await showPage(editsThatWork());
    expect(portOf(page, "start")?.getAttribute("title")).toBe("Drag to another step to connect");
    expect(portOf(page, "write")?.getAttribute("aria-hidden")).toBe("true");
    expect(portOf(page, "done")).toBeNull();
  });

  it("draws no port on a wait step, as a drop can't say which answer takes the arrow", async () => {
    const withWait: WorkflowView = {
      ...reply,
      steps: [...reply.steps, { id: "review", type: "wait", title: "Approve this reply?" }],
      arrows: [...reply.arrows, { from: "review", to: "done", event: "approve" }],
    };
    const { page } = await showPage(editsThatWork(), false, withWait);
    expect(portOf(page, "review")).toBeNull();
    expect(portOf(page, "start")).not.toBeNull();
  });

  it("draws a port muted until it's under the pointer or dragged from", async () => {
    const { page } = await showPage(editsThatWork());
    const ring = (stepId: string) => portOf(page, stepId)?.classList;
    const dot = (stepId: string) => portOf(page, stepId)?.firstElementChild?.classList;
    for (const stepId of ["start", "write"]) {
      expect(ring(stepId)).toContain("border-fg-muted");
      expect(ring(stepId)).toContain("hover:border-accent");
      expect(ring(stepId)).not.toContain("border-accent");
      expect(dot(stepId)).toContain("bg-fg-muted");
      expect(dot(stepId)).toContain("group-hover:bg-accent");
    }

    const port = await dragTo(page, "start", middleOf(page, "done"));
    expect(ring("start")).toContain("border-accent");
    expect(dot("start")).toContain("bg-accent");
    expect(ring("write")).toContain("border-fg-muted");
    expect(ring("write")).not.toContain("border-accent");

    await drop(port, { clientX: -500, clientY: -500 });
    expect(ring("start")).toContain("border-fg-muted");
    expect(ring("start")).not.toContain("border-accent");
  });

  it("adds an arrow on a drop on another step and says so", async () => {
    const edits = editsThatWork();
    const { page, announce } = await showPage(edits);
    const port = await dragTo(page, "start", middleOf(page, "done"));
    await drop(port, middleOf(page, "done"));

    expect(edits.changeArrows).toHaveBeenCalledWith({ hubId: "acme", id: "reply" }, "start", {
      kind: "add",
      to: "done",
    });
    // `start` already goes to `write` on done without a condition, so the new arrow never runs.
    expect(announce).toHaveBeenCalledWith(
      "Arrow added: start to done. Arrow 2 is never taken: arrow 1 always matches first.",
    );
  });

  it("names the steps as their cards do, as the step card's Add says it", async () => {
    const titled: WorkflowView = {
      ...reply,
      steps: titledSteps,
      arrows: [
        { from: "start", to: "write", condition: refund },
        { from: "write", to: "done" },
      ],
    };
    const { page, announce } = await showPage(editsThatWork(), false, titled);
    await drop(await dragTo(page, "start", middleOf(page, "done")), middleOf(page, "done"));
    expect(announce).toHaveBeenCalledWith("Arrow added: Start to Done.");
  });

  it("says when an earlier arrow always beats the new one", async () => {
    const titled: WorkflowView = {
      ...reply,
      steps: titledSteps,
      arrows: [
        { from: "start", to: "write", condition: refund },
        { from: "start", to: "write" },
        { from: "write", to: "done" },
      ],
    };
    const { page, announce } = await showPage(editsThatWork(), false, titled);
    await drop(await dragTo(page, "start", middleOf(page, "done")), middleOf(page, "done"));
    expect(announce).toHaveBeenCalledWith(
      "Arrow added: Start to Done. Arrow 3 is never taken: arrow 2 always matches first.",
    );
  });

  it("outlines the steps a drop can land on and draws the line while dragging", async () => {
    const { page } = await showPage(editsThatWork());
    expect(targets(page)).toEqual({ start: undefined, write: undefined, done: undefined });

    const port = await dragTo(page, "start", middleOf(page, "done"));
    expect(targets(page)).toEqual({ start: undefined, write: "can", done: "over" });
    expect(page.querySelector("[data-testid=connect-line]")).not.toBeNull();

    await drop(port, { clientX: -500, clientY: -500 });
    expect(targets(page)).toEqual({ start: undefined, write: undefined, done: undefined });
    expect(page.querySelector("[data-testid=connect-line]")).toBeNull();
  });

  it("adds nothing on a drop on empty canvas, on the step itself or a cancelled drag", async () => {
    const edits = editsThatWork();
    const { page } = await showPage(edits);

    await drop(await dragTo(page, "start", { clientX: -500, clientY: -500 }), {
      clientX: -500,
      clientY: -500,
    });
    await drop(await dragTo(page, "start", middleOf(page, "start")), middleOf(page, "start"));
    const port = await dragTo(page, "start", middleOf(page, "done"));
    await act(async () => port.dispatchEvent(pointer("pointercancel", middleOf(page, "done"))));
    await drop(port, middleOf(page, "done"));

    expect(edits.changeArrows).not.toHaveBeenCalled();
  });

  it("doesn't pan the canvas while dragging from a port", async () => {
    const { page } = await showPage(editsThatWork());
    const surface = page.querySelector<HTMLElement>("[data-testid=canvas-surface]");
    const before = surface?.style.transform;
    await dragTo(page, "start", { clientX: 600, clientY: 500 });
    expect(surface?.style.transform).toBe(before);
  });

  it("says why on a toast when the host can't change the arrows", async () => {
    const { page, toasts, announce } = await showPage({
      ...editsThatWork(),
      changeArrows: async () => {
        throw new KindedError("invalid_input", "The file can't be changed.");
      },
    });
    const port = await dragTo(page, "start", middleOf(page, "done"));
    await drop(port, middleOf(page, "done"));

    expect(toasts.list()[0]).toMatchObject({
      tone: "danger",
      title: "Couldn't change step start",
      text: "The file can't be changed.",
    });
    expect(announce).not.toHaveBeenCalled();
  });

  it("has no ports where the host can't change arrows, nor on a phone", async () => {
    const { changeArrows: _, ...withoutArrows } = editsThatWork();
    const noArrows = await showPage(withoutArrows);
    expect(noArrows.page.querySelector("[data-connect-port]")).toBeNull();
    unmount();

    const phone = await showPage(editsThatWork(), true);
    expect(phone.page.querySelector("[data-connect-port]")).toBeNull();
  });
});
