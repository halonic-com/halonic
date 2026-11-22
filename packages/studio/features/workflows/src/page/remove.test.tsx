// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { WorkflowView } from "../api.ts";
import { buttonNamed, unmount } from "../test-support.tsx";
import { arrowsSection, pick, reply, showPage } from "./step-arrows.test-helper.tsx";

// jsdom has no popover: a menu closes itself after a pick by hiding it.
beforeAll(() => {
  HTMLElement.prototype.hidePopover ??= () => {};
});
afterEach(unmount);

/** Presses the button whose name (its words or its label) is `name`. */
async function press(page: HTMLElement, name: string) {
  const button =
    page.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`) ??
    buttonNamed(page, name);
  await act(async () => button?.click());
}

/** Picks the step card on the canvas by its step's id, whatever the card's title. */
async function pickById(page: HTMLElement, stepId: string) {
  const card = page.querySelector<HTMLButtonElement>(`button[data-step='${stepId}']`);
  await act(async () => card?.click());
}

/** Support reply with titles, two of them shared, so the toasts name steps as their cards do. */
const titled: WorkflowView = {
  ...reply,
  steps: [
    { id: "sort", type: "task", title: "Sort it" },
    { id: "approve", type: "wait", title: "Reply" },
    { id: "write", type: "task", title: "Reply" },
    { id: "done", type: "final" },
  ],
};

/** The step card on the canvas that has focus, by its step's id. */
const focusedStep = () => (document.activeElement as HTMLElement | null)?.dataset["step"];

/** Support reply with its steps titled as their cards name them, but `done`, named by its id. */
const titles: Record<string, string> = { sort: "Sort", approve: "Approve", write: "Write" };
const workflow = {
  ...reply,
  steps: reply.steps.map((step) => ({ ...step, title: titles[step.id] })),
};

verifies("workflows.page.remove", () => {
  it("removes a step at once and says what went with it, with Undo", async () => {
    const { page, removeStep, toasts, announce } = await showPage(vi.fn, { workflow });
    await pick(page, "Write");

    await press(page, "Remove step");

    expect(removeStep).toHaveBeenCalledWith(expect.objectContaining({ id: "reply" }), "write");
    expect(toasts.list()).toEqual([
      expect.objectContaining({
        tone: "success",
        title: "Removed step Write and 3 arrows",
        action: expect.objectContaining({ label: "Undo" }),
      }),
    ]);
    // The toast speaks; nothing else is announced.
    expect(announce).not.toHaveBeenCalled();
    expect(page.querySelector("aside")).toBeNull();
    expect(focusedStep()).toBe("done");
  });

  it("puts focus on the canvas when the removed step was the last in the file", async () => {
    const { page } = await showPage(vi.fn);
    await pick(page, "done");

    await press(page, "Remove step");

    expect(document.activeElement?.getAttribute("aria-label")).toBe("Workflow canvas");
  });

  it("puts the step back from the toast's Undo, and says why when it can't", async () => {
    const undo = vi.fn(async () => {
      throw new KindedError("conflict", "The workspace changed after it was removed.");
    });
    const { page, toasts } = await showPage(vi.fn, { undo, workflow });
    await pick(page, "Write");
    await press(page, "Remove step");

    await act(async () => toasts.list()[0]?.action?.onClick());

    expect(undo).toHaveBeenCalledOnce();
    expect(toasts.list()).toContainEqual(
      expect.objectContaining({
        tone: "danger",
        title: "Couldn't put back step Write",
        text: "The workspace changed after it was removed.",
      }),
    );
  });

  it("names the arrow's steps when its Undo can't put it back", async () => {
    const undo = vi.fn(async () => {
      throw new KindedError("conflict", "The workspace changed after it was removed.");
    });
    const { page, toasts } = await showPage(vi.fn, { undo, workflow });
    await pick(page, "Sort");
    await press(page, "Remove arrow 1");

    await act(async () => toasts.list()[0]?.action?.onClick());

    expect(toasts.list()).toContainEqual(
      expect.objectContaining({
        tone: "danger",
        title: "Couldn't put back the arrow from Sort to Approve",
        text: "The workspace changed after it was removed.",
      }),
    );
  });

  it("refuses to remove the first step, says why under the button, and removes nothing", async () => {
    const { page, removeStep, announce } = await showPage(vi.fn);
    await pick(page, "sort");

    await press(page, "Remove step");

    const line =
      "This is the first step. Pick another first step in Configuration › General before removing it.";
    expect(removeStep).not.toHaveBeenCalled();
    const button = buttonNamed(page, "Remove step");
    const note = document.getElementById(button?.getAttribute("aria-describedby") ?? "");
    expect(note?.textContent).toBe(line);
    expect(announce).toHaveBeenCalledWith(line);
  });

  it("removes an arrow from its trash button, focusing the next row, else Add", async () => {
    const { page, removeArrow, toasts } = await showPage(vi.fn, { workflow });
    await pick(page, "Sort");

    await press(page, "Remove arrow 1");

    expect(removeArrow).toHaveBeenCalledWith(expect.anything(), "sort", 0, "approve");
    expect(arrowsSection(page).rows).toEqual(["1 → Write on done"]);
    expect(toasts.list()).toEqual([
      expect.objectContaining({ title: "Removed the arrow from Sort to Approve" }),
    ]);
    expect(document.activeElement?.textContent).toBe("→ Write on done");

    await press(page, "Remove arrow 1");

    expect(arrowsSection(page).rows).toEqual([]);
    expect(document.activeElement).toBe(buttonNamed(page, "Add"));
  });

  it("says why on a toast when the host can't remove, and keeps the step and the arrow", async () => {
    const { page, toasts } = await showPage(vi.fn, { fail: true });
    await pick(page, "sort");

    await press(page, "Remove arrow 1");

    expect(arrowsSection(page).rows).toHaveLength(2);
    expect(toasts.list()).toEqual([
      expect.objectContaining({
        tone: "danger",
        title: "Couldn't change step sort",
        text: "The file can't be changed.",
      }),
    ]);
  });

  it("names steps by title in its toasts, with the id after a shared title (C638 3)", async () => {
    const undo = vi.fn(async () => {
      throw new KindedError("conflict", "Step write can't be put back.");
    });
    const { page, toasts } = await showPage(vi.fn, { workflow: titled, undo });
    await pickById(page, "write");
    await press(page, "Remove step");
    await act(async () => toasts.list()[0]?.action?.onClick());

    expect(toasts.list().map((toast) => toast.title)).toEqual([
      "Removed step Reply (write) and 3 arrows",
      "Couldn't put back step Reply (write)",
    ]);
  });

  it("names both ends of a removed arrow by title, and the step when the host can't", async () => {
    const removed = await showPage(vi.fn, { workflow: titled });
    await pickById(removed.page, "sort");
    await press(removed.page, "Remove arrow 1");
    unmount();
    const refused = await showPage(vi.fn, { workflow: titled, fail: true });
    await pickById(refused.page, "sort");
    await press(refused.page, "Remove arrow 1");

    expect(removed.toasts.list()[0]?.title).toBe(
      "Removed the arrow from Sort it to Reply (approve)",
    );
    expect(refused.toasts.list()[0]?.title).toBe("Couldn't change step Sort it");
  });
});
