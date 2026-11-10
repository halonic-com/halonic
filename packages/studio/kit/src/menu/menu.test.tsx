// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Button } from "../button/button.tsx";
import { fakePopover, isOpen, restorePopover } from "../test/popover.ts";
import { click, render, unmountAll } from "../test/render.tsx";
import { Menu, type MenuEntry } from "./menu.tsx";

beforeEach(() => {
  fakePopover();
});

afterEach(() => {
  unmountAll();
  restorePopover();
});

const rename = vi.fn();
const remove = vi.fn();
const runNow = vi.fn();

const entries: readonly MenuEntry[] = [
  { id: "delete", label: "Delete agent", danger: true, onSelect: remove },
  { id: "open", label: "Open", keys: ["Ctrl", "O"], onSelect: vi.fn() },
  { id: "rename", label: "Rename…", onSelect: rename },
  { id: "copy", label: "Copy path", disabled: true, onSelect: vi.fn() },
  {
    id: "run",
    label: "Run now",
    unavailable: { reason: "Finish getting updates first." },
    onSelect: runNow,
  },
];

function renderMenu(menuEntries: readonly MenuEntry[] = entries) {
  const { container } = render(
    <Menu
      trigger={(props) => (
        <Button {...props} variant="ghost" icon={<span />} label="More actions for Sorter" />
      )}
      entries={menuEntries}
    />,
  );
  const trigger = container.querySelector("button") as HTMLButtonElement;
  const menu = container.querySelector("[role=menu]") as HTMLElement;
  const items = Array.from(menu.querySelectorAll<HTMLButtonElement>("[role=menuitem]"));
  return { trigger, menu, items };
}

async function openMenu(trigger: HTMLButtonElement): Promise<void> {
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

/** Each item's label, without its reason or its shortcut. */
const labels = (items: readonly HTMLElement[]) =>
  items.map((item) => item.querySelector(".flex-col > span")?.textContent);

verifies("kit.menu", () => {
  it("is a popover menu named by its trigger, with danger items last below a divider", () => {
    const { trigger, menu, items } = renderMenu();
    expect(menu.getAttribute("popover")).toBe("auto");
    expect(menu.getAttribute("aria-labelledby")).toBe(trigger.id);
    expect(trigger.getAttribute("popovertarget")).toBe(menu.id);
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(menu.className).toContain("min-w-45 overflow-y-auto rounded-md");
    expect(menu.className).toContain("bg-surface-raised text-fg shadow-2");
    expect(menu.className).toContain("starting:opacity-0");
    expect(labels(items)).toEqual(["Open", "Rename…", "Copy path", "Run now", "Delete agent"]);
    expect(menu.lastElementChild?.previousElementSibling?.tagName).toBe("HR");
    expect(items.at(-1)?.className).toContain("text-danger");
  });

  it("keeps one divider between groups, never at an end", () => {
    const item = (id: string) => ({ id, label: id, onSelect: vi.fn() });
    const { menu } = renderMenu(["divider", item("a"), "divider", "divider", item("b"), "divider"]);
    expect(Array.from(menu.children).map((child) => child.tagName)).toEqual([
      "BUTTON",
      "HR",
      "BUTTON",
    ]);
  });

  it("opens from its trigger and puts focus on the first item, which takes the muted fill", async () => {
    const { trigger, menu, items } = renderMenu();
    await openMenu(trigger);
    expect(isOpen(menu)).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(items[0]);
    expect(items[0]?.getAttribute("data-fill")).toBe("muted");
    expect(items[0]?.className).toContain("focus:bg-surface-muted");
    expect(menu.style.top).not.toBe("");
  });

  it("moves with the arrows, Home and End, skipping a disabled item and wrapping round", async () => {
    const { trigger, items } = renderMenu();
    await openMenu(trigger);
    await press("ArrowDown");
    await press("ArrowDown");
    expect(document.activeElement).toBe(items[3]);
    await press("ArrowUp");
    expect(document.activeElement).toBe(items[1]);
    await press("End");
    await press("ArrowDown");
    expect(document.activeElement).toBe(items[0]);
    await press("ArrowUp");
    expect(document.activeElement).toBe(items[4]);
    await press("Home");
    expect(document.activeElement).toBe(items[0]);
  });

  it("finds an item by the letters typed, and moves on when the same letter comes again", async () => {
    const { trigger, items } = renderMenu();
    await openMenu(trigger);
    await press("r");
    expect(document.activeElement).toBe(items[1]);
    await press("r");
    expect(document.activeElement).toBe(items[3]);
    await press("c");
    expect(document.activeElement).toBe(items[3]);
  });

  it("picks the active item with Enter, closes and returns focus to the trigger", async () => {
    rename.mockClear();
    const { trigger, menu } = renderMenu();
    await openMenu(trigger);
    await press("r");
    await press("Enter");
    expect(rename).toHaveBeenCalledOnce();
    expect(isOpen(menu)).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("picks an item on a click, and the pointer moves the active item", async () => {
    remove.mockClear();
    const { trigger, items } = renderMenu();
    await openMenu(trigger);
    const last = items.at(-1) as HTMLButtonElement;
    await act(async () => {
      last.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    });
    expect(document.activeElement).toBe(last);
    await click(last);
    expect(remove).toHaveBeenCalledOnce();
  });

  it("closes with Escape or Tab and returns focus to the trigger", async () => {
    for (const key of ["Escape", "Tab"]) {
      const { trigger, menu } = renderMenu();
      await openMenu(trigger);
      await press(key);
      expect(isOpen(menu)).toBe(false);
      expect(document.activeElement).toBe(trigger);
      unmountAll();
    }
  });

  it("shows closed when the browser closes it on an outside click", async () => {
    const { trigger, menu } = renderMenu();
    await openMenu(trigger);
    await act(async () => {
      menu.hidePopover();
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("lists a disabled item in fg-disabled; a click on it does nothing", async () => {
    const onSelect = vi.fn();
    const { trigger, items } = renderMenu([
      { id: "copy", label: "Copy path", disabled: true, onSelect },
    ]);
    await openMenu(trigger);
    const copy = items[0] as HTMLButtonElement;
    expect(copy.getAttribute("aria-disabled")).toBe("true");
    expect(copy.className).toContain("text-fg-disabled");
    expect(copy.className).not.toContain("focus:bg-surface-muted");
    await click(copy);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("gives an unavailable item its reason as a second line it is described by, and ignores Enter", async () => {
    const { trigger, items, menu } = renderMenu();
    const run = items[3] as HTMLButtonElement;
    const reason = document.getElementById(run.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("Finish getting updates first.");
    expect(reason?.className).toBe("text-small text-fg-muted");
    expect(run.getAttribute("aria-disabled")).toBe("true");
    expect(run.querySelector(".opacity-45")?.textContent).toBe("Run now");
    expect(run.className).toContain("py-1.5");
    await openMenu(trigger);
    await press("End");
    await press("ArrowUp");
    expect(document.activeElement).toBe(run);
    await press("Enter");
    expect(runNow).not.toHaveBeenCalled();
    expect(isOpen(menu)).toBe(true);
  });

  it("shows a shortcut as a Kbd and names it with aria-keyshortcuts", () => {
    const { items } = renderMenu();
    expect(items[0]?.getAttribute("aria-keyshortcuts")).toBe("Control+O");
    expect(items[0]?.querySelectorAll("kbd")).toHaveLength(2);
  });

  it("has 48px items with a 20px icon on a phone and under a coarse pointer", () => {
    const { items } = renderMenu([{ id: "open", label: "Open", icon: <svg />, onSelect: vi.fn() }]);
    expect(items[0]?.className).toContain("min-h-control-md");
    expect(items[0]?.className).toContain("phone:min-h-touch touch:min-h-touch");
    expect(items[0]?.firstElementChild?.className).toContain(
      "phone:size-icon-md touch:size-icon-md",
    );
  });
});
