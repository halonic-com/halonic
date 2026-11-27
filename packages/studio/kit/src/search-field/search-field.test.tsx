// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { SearchField } from "./search-field.tsx";

afterEach(() => {
  unmountAll();
});

function renderField() {
  const { container } = render(<SearchField label="Search chats" />);
  const pill = container.firstElementChild as HTMLElement;
  const input = pill.querySelector("input") as HTMLInputElement;
  const glass = pill.querySelector('[aria-hidden="true"]') as HTMLElement;
  return { pill, input, glass };
}

verifies("kit.search-field", () => {
  it("is a search field named by its label, which it shows while empty", () => {
    const { input } = renderField();
    expect(input.type).toBe("search");
    expect(input.getAttribute("aria-label")).toBe("Search chats");
    expect(input.placeholder).toBe("Search chats");
    expect(input.className).toContain("text-body");
    // 16px on a phone and under a coarse pointer, so the page doesn't zoom.
    expect(input.className).toContain("phone:text-input-touch");
    expect(input.className).toContain("touch:text-input-touch");
  });

  it("draws a 40px round surface-muted pill, the glass 16px in and 12px before the text", () => {
    const { pill, glass } = renderField();
    expect(pill.className).toContain("min-h-control-lg");
    expect(pill.className).toContain("phone:min-h-touch");
    expect(pill.className).toContain("rounded-full bg-surface-muted ps-4 pe-2");
    expect(pill.className).toContain("gap-3");
    expect(pill.className).not.toMatch(/(^| )border(-| |$)/);
    expect(glass.className).toContain("size-icon-md");
    expect(glass.className).toContain("text-fg-subtle");
    expect(glass.querySelector("svg")).not.toBeNull();
  });

  it("turns surface with a 2px accent ring inside its edge while its text has focus", () => {
    const { pill } = renderField();
    expect(pill.className).toContain("field-focus:bg-surface");
    expect(pill.className).toContain(
      "field-focus:outline-2 field-focus:-outline-offset-2 field-focus:outline-accent",
    );
    expect(pill.className).toContain("forced-colors:border forced-colors:border-[CanvasText]");
  });

  it("puts the caret in its text on a press anywhere on the pill", () => {
    const { input, glass } = renderField();
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      glass.dispatchEvent(press);
    });
    expect(press.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  // A cancelled Enter is what keeps a form round the field from submitting (`kit.enter-while-composing`).
  it("keeps the Enter that picks a word in an input method from the form and the screen", () => {
    const onKeyDown = vi.fn();
    const { container } = render(
      <form>
        <SearchField label="Search chats" onKeyDown={onKeyDown} />
      </form>,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    const press = (init: KeyboardEventInit & { keyCode?: number }) => {
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
      if (init.keyCode !== undefined)
        Object.defineProperty(event, "keyCode", { value: init.keyCode });
      act(() => {
        input.dispatchEvent(event);
      });
      return event.defaultPrevented;
    };
    expect(press({ key: "Enter", isComposing: true })).toBe(true);
    expect(press({ key: "Enter", keyCode: 229 })).toBe(true);
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(press({ key: "Enter" })).toBe(false);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });
});
