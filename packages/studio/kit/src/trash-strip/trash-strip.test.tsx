// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { click, render, unmountAll } from "../test/render.tsx";
import { TrashStrip } from "./trash-strip.tsx";

afterEach(() => {
  unmountAll();
});

function undoButton(container: HTMLElement): HTMLButtonElement {
  return container.querySelector("button") as HTMLButtonElement;
}

verifies("kit.trash-strip", () => {
  it("is a warning Callout in the page's margin, with Undo", () => {
    const { container } = render(
      <TrashStrip text="This file was moved to the trash" undoLabel="Undo" onUndo={() => {}} />,
    );
    const strip = container.firstElementChild as HTMLElement;
    expect(strip.className).toBe("px-4 pb-2");
    expect((strip.firstElementChild as HTMLElement).className).toContain("bg-warning-soft");
    expect(strip.textContent).toBe("This file was moved to the trashUndo");
  });

  it("takes no focus without focusUndo", () => {
    const { container } = render(
      <TrashStrip text="This file was moved to the trash" undoLabel="Undo" onUndo={() => {}} />,
    );
    expect(document.activeElement).not.toBe(undoButton(container));
  });

  it("puts focus on Undo with focusUndo, described by the text and the second line", () => {
    const { container } = render(
      <TrashStrip
        text="This skill was moved to the trash."
        detail="1 agent now shows an error until you take it off its Tools page."
        undoLabel="Undo"
        onUndo={() => {}}
        focusUndo
      />,
    );
    const undo = undoButton(container);
    expect(document.activeElement).toBe(undo);
    const description = document.getElementById(undo.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toBe(
      "This skill was moved to the trash. 1 agent now shows an error until you take it off its Tools page.",
    );
    expect(description?.querySelector("span")?.className).toBe("block");
  });

  it("calls onUndo and is busy while it runs", async () => {
    let finish = () => {};
    const onUndo = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { container } = render(
      <TrashStrip text="This agent was moved to the trash" undoLabel="Undo" onUndo={onUndo} />,
    );
    const undo = undoButton(container);
    await click(undo);
    expect(onUndo).toHaveBeenCalledOnce();
    expect(undo.getAttribute("aria-busy")).toBe("true");
    await act(async () => finish());
    expect(undo.hasAttribute("aria-busy")).toBe(false);
  });
});
