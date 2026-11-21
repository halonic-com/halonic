// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buttonNamed, deleteDialog, fakeDialogPage, restoreDialogPage } from "../test/dialogs.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { DONE_LABEL_MS } from "./done-label.ts";

beforeEach(() => {
  fakeDialogPage();
  vi.useFakeTimers({
    toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"],
  });
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
  vi.useRealTimers();
});

/** The Remove trust dialog after an internal error, with Copy details as its `errorAction`. */
function removeTrust(onClick: () => Promise<boolean>) {
  return render(
    deleteDialog({
      error: "Couldn't remove trust: Halonic ran into a problem it can't explain yet.",
      errorAction: { label: "Copy details", doneLabel: "Copied", onClick },
    }),
  );
}

function politeText(container: HTMLElement): string {
  act(() => vi.advanceTimersToNextFrame());
  const region = container.querySelector('dialog > [aria-live="polite"]') as HTMLElement;
  return region.textContent ?? "";
}

verifies("kit.callout-done-label", () => {
  it("reads Copied in place for 2 seconds and says it through the Dialog's polite region (C446-1)", async () => {
    const { container } = removeTrust(async () => true);
    await click(buttonNamed(container, "Copy details"));
    expect(buttonNamed(container, "Copied")).toBeDefined();
    expect(politeText(container)).toBe("Copied");
    act(() => vi.advanceTimersByTime(DONE_LABEL_MS));
    expect(buttonNamed(container, "Copy details")).toBeDefined();
  });

  it("keeps its label when the action gives false", async () => {
    const { container } = removeTrust(async () => false);
    await click(buttonNamed(container, "Copy details"));
    expect(buttonNamed(container, "Copy details")).toBeDefined();
    expect(politeText(container)).toBe("");
  });
});
