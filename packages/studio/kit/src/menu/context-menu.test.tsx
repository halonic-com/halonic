// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakePopover, isOpen, restorePopover } from "../test/popover.ts";
import { click, render, unmountAll } from "../test/render.tsx";
import { ContextMenu, type ContextMenuTarget } from "./context-menu.tsx";
import type { MenuEntry } from "./menu.tsx";

// jsdom's window has no size, so the menu would be held 8px from edges that aren't there.
const root = document.documentElement;

beforeEach(() => {
  fakePopover();
  Object.defineProperty(root, "clientWidth", { configurable: true, value: 1280 });
  Object.defineProperty(root, "clientHeight", { configurable: true, value: 800 });
});

afterEach(() => {
  unmountAll();
  restorePopover();
  Reflect.deleteProperty(root, "clientWidth");
  Reflect.deleteProperty(root, "clientHeight");
});

const closeTab = vi.fn();

const entries: readonly MenuEntry[] = [
  { id: "close", label: "Close", onSelect: closeTab },
  { id: "close-others", label: "Close other tabs", disabled: true, onSelect: vi.fn() },
  { id: "reopen", label: "Reopen closed tab", onSelect: vi.fn() },
];

/** A tab that opens the menu on a right-click, as a screen does, and a test handle to open it. */
function renderContextMenu() {
  let open: (target: ContextMenuTarget | undefined) => void = () => undefined;
  const onClose = vi.fn();
  function Screen() {
    const [target, setTarget] = useState<ContextMenuTarget>();
    open = setTarget;
    return (
      <>
        <div
          role="tab"
          aria-selected="true"
          tabIndex={0}
          onContextMenu={(event) => {
            event.preventDefault();
            setTarget({ element: event.currentTarget, at: { x: event.clientX, y: event.clientY } });
          }}
        >
          Support reply
        </div>
        <ContextMenu
          label="Support reply"
          entries={entries}
          target={target}
          onClose={() => {
            onClose();
            setTarget(undefined);
          }}
        />
      </>
    );
  }
  const { container } = render(<Screen />);
  const tab = container.querySelector("[role=tab]") as HTMLElement;
  const menu = container.querySelector("[role=menu]") as HTMLElement;
  const items = Array.from(menu.querySelectorAll<HTMLButtonElement>("[role=menuitem]"));
  const openFor = async (target: ContextMenuTarget | undefined) => {
    await act(async () => {
      open(target);
    });
  };
  return { tab, menu, items, onClose, openFor };
}

async function rightClick(element: Element, x: number, y: number): Promise<boolean> {
  let shown = true;
  await act(async () => {
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: x,
      clientY: y,
    });
    shown = element.dispatchEvent(event);
  });
  return shown;
}

async function press(key: string): Promise<void> {
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

verifies("kit.context-menu", () => {
  it("is a closed popover menu named by its label, with the Menu's look", () => {
    const { menu, items } = renderContextMenu();
    expect(menu.getAttribute("popover")).toBe("auto");
    expect(menu.getAttribute("aria-label")).toBe("Support reply");
    expect(menu.hasAttribute("aria-labelledby")).toBe(false);
    expect(menu.className).toContain("bg-surface-raised text-fg shadow-2");
    expect(isOpen(menu)).toBe(false);
    expect(items.map((item) => item.textContent)).toEqual([
      "Close",
      "Close other tabs",
      "Reopen closed tab",
    ]);
  });

  it("opens at the pointer on a right-click, with focus on the menu itself", async () => {
    const { tab, menu } = renderContextMenu();
    await rightClick(tab, 120, 30);
    expect(isOpen(menu)).toBe(true);
    expect(menu.style.left).toBe("120px");
    expect(menu.style.top).toBe("30px");
    expect(document.activeElement).toBe(menu);
  });

  it("opens below the element without a point, with focus on its first usable item", async () => {
    const { tab, menu, items, openFor } = renderContextMenu();
    vi.spyOn(tab, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 40, y: 8, width: 200, height: 34 }),
    );
    await openFor({ element: tab });
    expect(isOpen(menu)).toBe(true);
    expect(menu.style.left).toBe("40px");
    expect(menu.style.top).toBe("46px");
    expect(document.activeElement).toBe(items[0]);
    await press("ArrowDown");
    expect(document.activeElement).toBe(items[2]);
  });

  it("closes with Escape or Tab and gives the focus back to the element", async () => {
    for (const key of ["Escape", "Tab"]) {
      const { tab, menu, onClose, openFor } = renderContextMenu();
      await openFor({ element: tab });
      await press(key);
      expect(isOpen(menu)).toBe(false);
      expect(document.activeElement).toBe(tab);
      expect(onClose).toHaveBeenCalledOnce();
      unmountAll();
    }
  });

  it("picks an item: closes, gives the focus back, then runs it", async () => {
    closeTab.mockClear();
    closeTab.mockImplementation(() => {
      expect(document.activeElement?.getAttribute("role")).toBe("tab");
    });
    const { tab, menu, items, onClose, openFor } = renderContextMenu();
    await openFor({ element: tab });
    await click(items[0] as HTMLElement);
    expect(closeTab).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(isOpen(menu)).toBe(false);
  });

  it("tells its owner when the browser closes it on an outside click", async () => {
    const { tab, menu, onClose } = renderContextMenu();
    await rightClick(tab, 10, 10);
    await act(async () => {
      menu.hidePopover();
    });
    expect(onClose).toHaveBeenCalledOnce();
    await rightClick(tab, 20, 20);
    expect(isOpen(menu)).toBe(true);
    expect(menu.style.left).toBe("20px");
  });

  it("closes when the owner takes the target away, without calling onClose", async () => {
    const { tab, menu, onClose, openFor } = renderContextMenu();
    await openFor({ element: tab });
    await openFor(undefined);
    expect(isOpen(menu)).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the browser's own menu from opening over it", async () => {
    const { tab, menu } = renderContextMenu();
    await rightClick(tab, 10, 10);
    expect(await rightClick(menu, 12, 12)).toBe(false);
  });
});
