// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { buttonNamed, unmount } from "../test-support.tsx";
import { arrowsSection, pick, showPage } from "./step-arrows.test-helper.tsx";

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

/** The step card on the canvas that has focus, by its step's id. */
const focusedStep = () => (document.activeElement as HTMLElement | null)?.dataset["step"];

verifies("workflows.page.remove", () => {
  it("removes a step at once and says what went with it, with Undo", async () => {
    const { page, removeStep, toasts, announce } = await showPage();
    await pick(page, "write");

    await press(page, "Remove step");

    expect(removeStep).toHaveBeenCalledWith(expect.objectContaining({ id: "reply" }), "write");
    expect(toasts.list()).toEqual([
      expect.objectContaining({
        tone: "success",
        title: "Removed step write and 3 arrows",
        action: expect.objectContaining({ label: "Undo" }),
      }),
    ]);
    // The toast speaks; nothing else is announced.
    expect(announce).not.toHaveBeenCalled();
    expect(page.querySelector("aside")).toBeNull();
    expect(focusedStep()).toBe("done");
  });

  it("puts focus on the canvas when the removed step was the last in the file", async () => {
    const { page } = await showPage();
    await pick(page, "done");

    await press(page, "Remove step");

    expect(document.activeElement?.getAttribute("aria-label")).toBe("Workflow canvas");
  });

  it("puts the step back from the toast's Undo, and says why when it can't", async () => {
    const undo = vi.fn(async () => {
      throw new KindedError("conflict", "Step write can't be put back.");
    });
    const { page, toasts } = await showPage({ undo });
    await pick(page, "write");
    await press(page, "Remove step");

    await act(async () => toasts.list()[0]?.action?.onClick());

    expect(undo).toHaveBeenCalledOnce();
    expect(toasts.list()).toContainEqual(
      expect.objectContaining({
        tone: "danger",
        title: "Couldn't put back step write",
        text: "Step write can't be put back.",
      }),
    );
  });

  it("refuses to remove the first step, says why under the button, and removes nothing", async () => {
    const { page, removeStep, announce } = await showPage();
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
    const { page, removeArrow, toasts } = await showPage();
    await pick(page, "sort");

    await press(page, "Remove arrow 1");

    expect(removeArrow).toHaveBeenCalledWith(expect.anything(), "sort", 0);
    expect(arrowsSection(page).rows).toEqual(["1 → write on done"]);
    expect(toasts.list()).toEqual([
      expect.objectContaining({ title: "Removed the arrow from sort to approve" }),
    ]);
    expect(document.activeElement?.textContent).toBe("→ write on done");

    await press(page, "Remove arrow 1");

    expect(arrowsSection(page).rows).toEqual([]);
    expect(document.activeElement).toBe(buttonNamed(page, "Add"));
  });

  it("says why on a toast when the host can't remove, and keeps the step and the arrow", async () => {
    const { page, toasts } = await showPage({ fail: true });
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
});
