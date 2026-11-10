// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Button } from "../button/button.tsx";
import { fakePopover, isOpen, restorePopover } from "../test/popover.ts";
import { render, unmountAll } from "../test/render.tsx";
import { TOOLTIP_DELAY_MS, Tooltip } from "./tooltip.tsx";

beforeEach(() => {
  fakePopover();
  vi.useFakeTimers();
});

afterEach(() => {
  unmountAll();
  restorePopover();
  vi.useRealTimers();
});

function renderTooltip(keys?: readonly string[]) {
  const { container } = render(
    <Tooltip text="New tab" {...(keys === undefined ? {} : { keys })}>
      {(props) => <Button {...props} variant="ghost" icon={<svg />} label="New tab" />}
    </Tooltip>,
  );
  const button = container.querySelector("button") as HTMLButtonElement;
  const tooltip = container.querySelector("[role=tooltip]") as HTMLElement;
  return { button, tooltip, wrapper: button.parentElement as HTMLElement };
}

function pointer(element: Element, type: "pointerover" | "pointerout", pointerType = "mouse") {
  act(() => {
    element.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType }));
  });
}

verifies("kit.tooltip", () => {
  it("is a manual popover in the inverted look, linked to its control", () => {
    const { button, tooltip } = renderTooltip();
    expect(tooltip.getAttribute("popover")).toBe("manual");
    expect(button.getAttribute("aria-describedby")).toBe(tooltip.id);
    expect(tooltip.textContent).toBe("New tab");
    expect(tooltip.className).toContain("bg-fg text-caption text-surface");
    expect(tooltip.className).toContain("max-w-60 rounded-xs border border-transparent px-2 py-1");
    expect(tooltip.className).toContain("pointer-events-none");
    expect(tooltip.className).toContain("starting:opacity-0");
  });

  it("shows after 500ms of hover, below its control, and hides when the pointer leaves", () => {
    const { tooltip, wrapper } = renderTooltip();
    pointer(wrapper, "pointerover");
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1));
    expect(isOpen(tooltip)).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(isOpen(tooltip)).toBe(true);
    expect(tooltip.style.top).not.toBe("");
    pointer(wrapper, "pointerout");
    expect(isOpen(tooltip)).toBe(false);
  });

  it("doesn't show on touch", () => {
    const { tooltip, wrapper } = renderTooltip();
    pointer(wrapper, "pointerover", "touch");
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
    expect(isOpen(tooltip)).toBe(false);
  });

  it("shows at once on keyboard focus and hides on blur", () => {
    const { button, tooltip } = renderTooltip();
    act(() => button.focus());
    expect(isOpen(tooltip)).toBe(true);
    act(() => button.blur());
    expect(isOpen(tooltip)).toBe(false);
  });

  it("hides on Escape, without letting the Escape reach a dialog round it", () => {
    const { button, tooltip } = renderTooltip();
    const outside = vi.fn();
    document.addEventListener("keydown", outside);
    act(() => button.focus());
    const escapeKey = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      button.dispatchEvent(escapeKey);
    });
    expect(isOpen(tooltip)).toBe(false);
    expect(escapeKey.defaultPrevented).toBe(true);
    expect(outside).not.toHaveBeenCalled();
    // Once it's hidden, Escape goes on to whatever is under it.
    act(() => {
      button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(outside).toHaveBeenCalledOnce();
    document.removeEventListener("keydown", outside);
  });

  it("shows a shortcut after the words, as plain keys without a box, and names it on the control", () => {
    const { button, tooltip } = renderTooltip(["Ctrl", "T"]);
    expect(button.getAttribute("aria-keyshortcuts")).toBe("Control+T");
    const keys = Array.from(tooltip.querySelectorAll("kbd"));
    expect(keys.map((key) => key.textContent)).toEqual(["Ctrl", "T"]);
    expect(keys[0]?.className).toBe("font-mono text-caption");
    expect(keys[0]?.parentElement?.className).toContain("gap-1.5");
    expect(keys[0]?.parentElement?.parentElement?.className).toBe("ml-2");
  });

  it("adds its text to an unavailable control's reason", () => {
    const { container } = render(
      <Tooltip text="Make a version">
        {(props) => (
          <Button {...props} unavailable={{ reason: "why" }}>
            Make a version
          </Button>
        )}
      </Tooltip>,
    );
    const tooltip = container.querySelector("[role=tooltip]") as HTMLElement;
    expect(container.querySelector("button")?.getAttribute("aria-describedby")).toBe(
      `why ${tooltip.id}`,
    );
  });
});
