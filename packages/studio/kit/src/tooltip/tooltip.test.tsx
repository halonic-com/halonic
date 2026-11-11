// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Button } from "../button/button.tsx";
import { fakePopover, isOpen, restorePopover } from "../test/popover.ts";
import { render, unmountAll } from "../test/render.tsx";
import { TOOLTIP_DELAY_MS, Tooltip, useTooltip } from "./tooltip.tsx";

beforeEach(() => {
  fakePopover();
  vi.useFakeTimers();
});

afterEach(() => {
  unmountAll();
  restorePopover();
  vi.useRealTimers();
});

/** An icon button named "New tab" with the Tooltip "New tab", which is its name. */
function renderTooltip(keys?: readonly string[]) {
  const { container } = render(
    <Tooltip text="New tab" isName {...(keys === undefined ? {} : { keys })}>
      {(props) => <Button {...props} variant="ghost" icon={<svg />} label="New tab" />}
    </Tooltip>,
  );
  const button = container.querySelector("button") as HTMLButtonElement;
  const tooltip = container.querySelector("[role=tooltip]") as HTMLElement;
  return { button, tooltip, wrapper: button.parentElement as HTMLElement };
}

/**
 * Focuses the control as the keyboard would. jsdom guesses `:focus-visible` from the events it has
 * seen, so a bare `focus()` matches it only some of the time; this says which focus it was.
 */
function focus(button: HTMLElement, by: "keyboard" | "pointer" = "keyboard") {
  const matches = button.matches.bind(button);
  vi.spyOn(button, "matches").mockImplementation((selector) =>
    selector === ":focus-visible" ? by === "keyboard" : matches(selector),
  );
  act(() => button.focus());
}

function pointer(
  element: Element,
  type: "pointerover" | "pointerout" | "pointerdown",
  pointerType = "mouse",
) {
  act(() => {
    element.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType }));
  });
}

verifies("kit.tooltip", () => {
  it("is a manual popover in the inverted look, describing its control", () => {
    const { container } = render(
      <Tooltip text="Make a version of the flow">
        {(props) => <Button {...props}>Make a version</Button>}
      </Tooltip>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    const tooltip = container.querySelector("[role=tooltip]") as HTMLElement;
    expect(tooltip.getAttribute("popover")).toBe("manual");
    expect(button.getAttribute("aria-describedby")).toBe(tooltip.id);
    expect(tooltip.textContent).toBe("Make a version of the flow");
    expect(tooltip.className).toContain("bg-inverse text-caption text-surface");
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

  it("doesn't describe the control when its text is the control's name, but keeps the shortcut", () => {
    const { button } = renderTooltip(["Ctrl", "T"]);
    expect(button.getAttribute("aria-label")).toBe("New tab");
    expect(button.hasAttribute("aria-describedby")).toBe(false);
    expect(button.getAttribute("aria-keyshortcuts")).toBe("Control+T");
  });

  it("is centred under its control", () => {
    const { tooltip, wrapper } = renderTooltip();
    const root = document.documentElement;
    Object.defineProperty(root, "clientWidth", { configurable: true, value: 800 });
    Object.defineProperty(root, "clientHeight", { configurable: true, value: 600 });
    wrapper.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 100, y: 50, width: 32, height: 32 });
    tooltip.getBoundingClientRect = () => DOMRect.fromRect({ width: 60, height: 24 });
    pointer(wrapper, "pointerover");
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
    expect(tooltip.style.left).toBe("86px");
    expect(tooltip.style.top).toBe("86px");
    Reflect.deleteProperty(root, "clientWidth");
    Reflect.deleteProperty(root, "clientHeight");
  });

  it("hides on a press and doesn't show again until the pointer leaves and comes back", () => {
    const { button, tooltip, wrapper } = renderTooltip();
    pointer(wrapper, "pointerover");
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
    expect(isOpen(tooltip)).toBe(true);
    pointer(button, "pointerdown");
    expect(isOpen(tooltip)).toBe(false);
    // Focus coming back with the ring, from a menu the press opened, doesn't show it either.
    focus(button);
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
    expect(isOpen(tooltip)).toBe(false);
    pointer(wrapper, "pointerout");
    pointer(wrapper, "pointerover");
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
    expect(isOpen(tooltip)).toBe(true);
  });

  it("doesn't show when a press comes before the 500ms", () => {
    const { button, tooltip, wrapper } = renderTooltip();
    pointer(wrapper, "pointerover");
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 100));
    pointer(button, "pointerdown");
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
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
    focus(button);
    expect(isOpen(tooltip)).toBe(true);
    act(() => button.blur());
    expect(isOpen(tooltip)).toBe(false);
  });

  it("doesn't show when a click focuses the control", () => {
    const { button, tooltip } = renderTooltip();
    focus(button, "pointer");
    expect(isOpen(tooltip)).toBe(false);
  });

  it("hides on Escape, without letting the Escape reach a dialog round it", () => {
    const { button, tooltip } = renderTooltip();
    const outside = vi.fn();
    document.addEventListener("keydown", outside);
    focus(button);
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

/** A tab with the full path as its tooltip, from `useTooltip` and with no wrapper. */
function TabWithTooltip({ showIf }: { readonly showIf?: () => boolean }) {
  const { anchor, trigger, popover } = useTooltip({
    text: "Workflows / Support reply",
    ...(showIf === undefined ? {} : { showIf }),
  });
  return (
    <div role="tablist">
      <div role="tab" aria-selected tabIndex={0} {...anchor} {...trigger}>
        Support reply
      </div>
      {popover}
    </div>
  );
}

verifies("kit.tooltip-parts", () => {
  it("puts the tooltip on the control itself, with no wrapper", () => {
    const { container } = render(<TabWithTooltip />);
    const tab = container.querySelector("[role=tab]") as HTMLElement;
    const tooltip = container.querySelector("[role=tooltip]") as HTMLElement;
    expect(tab.parentElement?.getAttribute("role")).toBe("tablist");
    expect(tab.getAttribute("aria-describedby")).toBe(tooltip.id);
    pointer(tab, "pointerover");
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
    expect(isOpen(tooltip)).toBe(true);
    expect(tooltip.textContent).toBe("Workflows / Support reply");
    pointer(tab, "pointerout");
    expect(isOpen(tooltip)).toBe(false);
  });

  it("shows only while showIf says yes, asked each time it would show", () => {
    let cut = false;
    const { container } = render(<TabWithTooltip showIf={() => cut} />);
    const tab = container.querySelector("[role=tab]") as HTMLElement;
    const tooltip = container.querySelector("[role=tooltip]") as HTMLElement;
    pointer(tab, "pointerover");
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
    expect(isOpen(tooltip)).toBe(false);
    pointer(tab, "pointerout");
    cut = true;
    pointer(tab, "pointerover");
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
    expect(isOpen(tooltip)).toBe(true);
  });

  it("asks showIf on keyboard focus too", () => {
    const { container } = render(<TabWithTooltip showIf={() => false} />);
    const tab = container.querySelector("[role=tab]") as HTMLButtonElement;
    focus(tab);
    expect(isOpen(container.querySelector("[role=tooltip]") as HTMLElement)).toBe(false);
  });
});
