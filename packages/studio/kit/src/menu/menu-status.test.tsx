// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Button } from "../button/button.tsx";
import { fakePopover, restorePopover } from "../test/popover.ts";
import { render, unmountAll } from "../test/render.tsx";
import { Menu, type MenuEntry } from "./menu.tsx";

beforeEach(() => {
  fakePopover();
});

afterEach(() => {
  unmountAll();
  restorePopover();
});

const footer = "Keeps your 40 most recent chats on this computer.";

function menu(entries: readonly MenuEntry[]): HTMLElement {
  const { container } = render(
    <Menu
      trigger={(props) => <Button {...props}>Add a routine</Button>}
      entries={entries}
      footer={footer}
    />,
  );
  return container.querySelector("[role=menu]") as HTMLElement;
}

verifies("kit.menu-status", () => {
  it("shows the time and the running dot, and names the item by its name", () => {
    const list = menu([
      {
        id: "c1",
        label: "Add a routine",
        time: "10:42",
        running: "answering",
        name: "Add a routine, 10:42, answering",
        onSelect: vi.fn(),
      },
    ]);
    const row = list.querySelector("[role=menuitem]") as HTMLElement;
    expect(row.getAttribute("aria-label")).toBe("Add a routine, 10:42, answering");
    expect(row.querySelector(".text-caption.tabular-nums")?.textContent).toBe("10:42");
    expect(row.querySelector(".bg-running")).not.toBeNull();
  });

  it("shows a count as a neutral chip", () => {
    const list = menu([{ id: "c2", label: "Fix", count: "2 to review", onSelect: vi.fn() }]);
    const chip = list.querySelector("[aria-hidden=true] > span.bg-surface-muted");
    expect(chip?.textContent).toBe("2 to review");
  });

  it("puts the footer under the items, below a divider, and not as an item", () => {
    const list = menu([{ id: "new", label: "New chat", onSelect: vi.fn() }]);
    const last = list.lastElementChild as HTMLElement;
    expect(last.textContent).toBe(footer);
    expect(last.getAttribute("role")).toBeNull();
    expect(last.previousElementSibling?.tagName).toBe("HR");
  });

  it("shows the footer alone in a menu without items", () => {
    const list = menu([]);
    expect(list.textContent).toBe(footer);
    expect(list.querySelector("hr")).toBeNull();
  });
});
