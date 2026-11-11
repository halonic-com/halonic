// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { click, render, unmountAll } from "../test/render.tsx";
import { List } from "./list.tsx";
import type { ListRow } from "./list-props.ts";

afterEach(() => {
  unmountAll();
});

const agents: readonly ListRow[] = [
  { id: "sorter", title: "Sorter", meta: "Sorts the inbox" },
  { id: "writer", title: "Writer", meta: "Drafts replies" },
  { id: "checker", title: "Checker" },
];

function rowsIn(container: HTMLElement): HTMLTableRowElement[] {
  return Array.from(container.querySelectorAll("tr"));
}

function mainCell(container: HTMLElement, index: number): HTMLElement {
  return rowsIn(container)[index]?.querySelector('[role="gridcell"]') as HTMLElement;
}

verifies("kit.list", () => {
  it("shows the current row selected, with aria-current and no checkbox, and still opens rows", async () => {
    const onOpen = vi.fn();
    const { container } = render(
      <List label="Inbox" rows={agents} onOpen={onOpen} current="writer" />,
    );
    expect(rowsIn(container)[1]?.getAttribute("aria-current")).toBe("true");
    expect(mainCell(container, 1).className).toContain("bg-accent-soft");
    expect(mainCell(container, 1).className).toContain("selected-bar");
    expect(rowsIn(container)[0]?.hasAttribute("aria-current")).toBe(false);
    expect(rowsIn(container)[0]?.hasAttribute("aria-selected")).toBe(false);
    expect(mainCell(container, 0).className).not.toContain("selected-bar");
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    act(() => mainCell(container, 1).focus());
    act(() => {
      mainCell(container, 1).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
    await click(mainCell(container, 2));
    expect(onOpen.mock.calls).toEqual([["writer"], ["checker"]]);
  });

  it("keeps the current row apart from the selection: it isn't selected or ticked", () => {
    const { container } = render(
      <List
        label="Inbox"
        rows={agents}
        onOpen={() => {}}
        current="writer"
        selection={{ selected: new Set(["checker"]), onToggle: () => {} }}
      />,
    );
    const boxes = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    );
    expect(rowsIn(container)[1]?.getAttribute("aria-current")).toBe("true");
    expect(rowsIn(container)[1]?.getAttribute("aria-selected")).toBe("false");
    expect(boxes[1]?.checked).toBe(false);
    expect(rowsIn(container)[1]?.querySelector("td")?.className).toContain("selected-bar");
    expect(rowsIn(container)[2]?.getAttribute("aria-selected")).toBe("true");
    expect(boxes[2]?.checked).toBe(true);
  });
});
