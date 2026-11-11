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

const workspaceMenu: readonly MenuEntry[] = [
  { heading: "Recent" },
  { id: "acme", label: "Acme", detail: "~/Work/acme", onSelect: vi.fn() },
  { id: "beta", label: "Beta", detail: "~/Work/beta", onSelect: vi.fn() },
  "divider",
  { id: "open", label: "Open a folder…", onSelect: vi.fn() },
];

function renderMenu(entries: readonly MenuEntry[] = workspaceMenu) {
  const { container } = render(
    <Menu trigger={(props) => <Button {...props}>Workspace: Acme</Button>} entries={entries} />,
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

verifies("kit.menu-groups", () => {
  it("puts the heading and the items under it in a group named by the heading", () => {
    const { menu, items } = renderMenu();
    const group = menu.querySelector("[role=group]") as HTMLElement;
    const heading = document.getElementById(group.getAttribute("aria-labelledby") ?? "");
    expect(heading?.textContent).toBe("Recent");
    expect(heading?.className).toContain("text-caption uppercase tracking-label text-fg-subtle");
    expect(group.contains(items[0] ?? null)).toBe(true);
    expect(group.contains(items[1] ?? null)).toBe(true);
    expect(group.contains(items[2] ?? null)).toBe(false);
    expect(Array.from(menu.children).map((child) => child.tagName)).toEqual([
      "DIV",
      "HR",
      "BUTTON",
    ]);
  });

  it("isn't an item: not focusable, and passed by on opening, the arrows, Home and End", async () => {
    const { trigger, menu, items } = renderMenu();
    const heading = menu.querySelector("[role=group] > div") as HTMLElement;
    expect(heading.getAttribute("role")).toBe("presentation");
    expect(heading.hasAttribute("tabindex")).toBe(false);
    await openMenu(trigger, "keyboard");
    expect(document.activeElement).toBe(items[0]);
    await press("ArrowUp");
    expect(document.activeElement).toBe(items[2]);
    await press("Home");
    expect(document.activeElement).toBe(items[0]);
    await press("End");
    await press("ArrowDown");
    expect(document.activeElement).toBe(items[0]);
  });

  it("is passed by when typing to find an item", async () => {
    const { trigger, menu } = renderMenu();
    await openMenu(trigger, "mouse");
    await press("r");
    expect(document.activeElement).toBe(menu);
  });

  it("shows an item's detail as a second line that describes it, its name staying the label", () => {
    const { items } = renderMenu();
    const acme = items[0] as HTMLButtonElement;
    const detail = document.getElementById(acme.getAttribute("aria-describedby") ?? "");
    expect(detail?.textContent).toBe("~/Work/acme");
    expect(detail?.getAttribute("aria-hidden")).toBe("true");
    expect(detail?.className).toContain("truncate text-caption text-fg-subtle");
    expect(acme.contains(detail ?? null)).toBe(true);
    expect(items[2]?.hasAttribute("aria-describedby")).toBe(false);
  });

  it("draws no heading with nothing under it", () => {
    const { menu } = renderMenu([
      { heading: "Recent" },
      "divider",
      { id: "open", label: "Open a folder…", onSelect: vi.fn() },
    ]);
    expect(menu.querySelector("[role=group]")).toBeNull();
    expect(menu.textContent).not.toContain("Recent");
    expect(Array.from(menu.children).map((child) => child.tagName)).toEqual(["BUTTON"]);
  });
});
