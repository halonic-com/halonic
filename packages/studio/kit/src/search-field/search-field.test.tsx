// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
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

  it("turns surface with a 2px accent ring inside its edge on keyboard focus", () => {
    const { pill } = renderField();
    expect(pill.className).toContain("has-focus-visible:bg-surface");
    expect(pill.className).toContain(
      "has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent",
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
});
