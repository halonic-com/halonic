// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Button } from "../button/button.tsx";
import { fakePopover, restorePopover } from "../test/popover.ts";
import { click, render, unmountAll } from "../test/render.tsx";
import { Menu, type MenuEntry } from "./menu.tsx";

beforeEach(() => {
  fakePopover();
});

afterEach(() => {
  unmountAll();
  restorePopover();
});

const costLine = "Runs on the built-in test model, with scripted replies. No key, no cost.";

const entries: readonly MenuEntry[] = [
  { id: "tests", label: "Run its tests", onSelect: vi.fn() },
  { id: "own", label: "Start your own workspace", onSelect: vi.fn() },
];

function renderMenu(description?: string) {
  const { container } = render(
    <Menu
      trigger={(props) => <Button {...props}>Sample · test model</Button>}
      entries={entries}
      description={description}
      align="end"
    />,
  );
  const trigger = container.querySelector("button") as HTMLButtonElement;
  const menu = container.querySelector("[role=menu]") as HTMLElement;
  const items = Array.from(menu.querySelectorAll<HTMLButtonElement>("[role=menuitem]"));
  return { trigger, menu, items };
}

/** Opens the menu as the keyboard or the mouse would; jsdom can't tell `:focus-visible` itself. */
async function openMenu(trigger: HTMLButtonElement, by: "keyboard" | "mouse"): Promise<void> {
  const matches = trigger.matches.bind(trigger);
  vi.spyOn(trigger, "matches").mockImplementation((selector) =>
    selector === ":focus-visible" ? by === "keyboard" : matches(selector),
  );
  trigger.focus();
  await click(trigger);
}

async function press(key: string): Promise<void> {
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

verifies("kit.menu-description", () => {
  it("shows the description first, with a divider under it, and describes the menu by it", () => {
    const { menu } = renderMenu(costLine);
    const [line, divider, firstItem] = Array.from(menu.children);
    expect(line?.tagName).toBe("P");
    expect(line?.textContent).toBe(costLine);
    expect(menu.getAttribute("aria-describedby")).toBe(line?.id);
    expect(line?.id).not.toBe("");
    expect(divider?.tagName).toBe("HR");
    expect(divider?.className).toContain("border-t border-border");
    expect(firstItem?.getAttribute("role")).toBe("menuitem");
  });

  it("is small muted text, padded 8px 8px 6px, at most 300px wide", () => {
    const { menu } = renderMenu(costLine);
    const line = menu.querySelector("p") as HTMLElement;
    expect(line.className).toContain("text-small text-fg-muted");
    expect(line.className).toContain("px-2 pt-2 pb-1.5");
    expect(line.className).toContain("max-w-75");
    expect(line.className).not.toContain("truncate");
  });

  it("isn't an item: no role, not focusable", () => {
    const { menu } = renderMenu(costLine);
    const line = menu.querySelector("p") as HTMLElement;
    expect(line.hasAttribute("role")).toBe(false);
    expect(line.hasAttribute("tabindex")).toBe(false);
  });

  it("is passed by when the keyboard opens the menu and by the arrows, Home and End", async () => {
    const { trigger, items } = renderMenu(costLine);
    await openMenu(trigger, "keyboard");
    expect(document.activeElement).toBe(items[0]);
    await press("ArrowUp");
    expect(document.activeElement).toBe(items[1]);
    await press("ArrowDown");
    expect(document.activeElement).toBe(items[0]);
    await press("End");
    await press("Home");
    expect(document.activeElement).toBe(items[0]);
  });

  it("is passed by when typing to find an item", async () => {
    const { trigger, menu, items } = renderMenu(costLine);
    await openMenu(trigger, "mouse");
    expect(document.activeElement).toBe(menu);
    // "R" also starts the description; it finds the item.
    await press("r");
    expect(document.activeElement).toBe(items[0]);
  });

  it("leaves a menu without one as it was", () => {
    const { menu } = renderMenu();
    expect(menu.hasAttribute("aria-describedby")).toBe(false);
    expect(menu.firstElementChild?.getAttribute("role")).toBe("menuitem");
    expect(menu.querySelector("p")).toBeNull();
  });
});
