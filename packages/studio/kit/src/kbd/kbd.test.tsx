// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { Kbd, keyShortcutsLabel } from "./kbd.tsx";

afterEach(() => {
  unmountAll();
});

verifies("kit.kbd", () => {
  it("draws one box per key, in order", () => {
    const { container } = render(<Kbd keys={["Ctrl", "Shift", "F"]} />);
    const keys = Array.from(container.querySelectorAll("kbd"));
    expect(keys.map((key) => key.textContent)).toEqual(["Ctrl", "Shift", "F"]);
    expect(keys[0]?.className).toContain("font-mono text-caption text-fg-muted");
    expect(keys[0]?.className).toContain("min-h-5 min-w-5");
    expect(keys[0]?.className).toContain("rounded-xs border border-transparent");
    expect(keys[0]?.className).toContain("contrast-more:border-current");
    expect(keys[0]?.className).toContain("bg-surface-muted px-1");
    // In the active menu item, on its muted fill, the box steps up to border.
    expect(keys[0]?.className).toContain("on-muted:bg-border on-muted:text-fg");
  });

  it("keeps a key that appears twice", () => {
    const { container } = render(<Kbd keys={["G", "G"]} />);
    expect(container.querySelectorAll("kbd")).toHaveLength(2);
  });

  it("puts 2px between the boxes and hides them on a phone", () => {
    const { container } = render(<Kbd keys={["Ctrl", "K"]} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("gap-0.5");
    expect(wrapper.className).toContain("phone:hidden");
  });

  it('is hidden from screen readers, so a menu item isn\'t named "New tab CtrlT"', () => {
    const { container } = render(
      <button type="button" aria-keyshortcuts={keyShortcutsLabel(["Ctrl", "T"])}>
        New tab <Kbd keys={["Ctrl", "T"]} />
      </button>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.querySelector("span")?.getAttribute("aria-hidden")).toBe("true");
    expect(button.getAttribute("aria-keyshortcuts")).toBe("Control+T");
  });

  it("names the shortcut for aria-keyshortcuts from the same keys", () => {
    expect(keyShortcutsLabel(["Ctrl", "Shift", "T"])).toBe("Control+Shift+T");
    expect(keyShortcutsLabel(["⌘", "K"])).toBe("Meta+K");
    expect(keyShortcutsLabel(["⌥", "⇧", "↑"])).toBe("Alt+Shift+ArrowUp");
    expect(keyShortcutsLabel(["Esc"])).toBe("Escape");
  });
});
