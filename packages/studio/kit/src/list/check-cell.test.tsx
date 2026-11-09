// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { click, render, unmountAll } from "../test/render.tsx";
import { List } from "./list.tsx";
import type { ListRow } from "./list-props.ts";

afterEach(() => {
  unmountAll();
});

const files: readonly ListRow[] = [
  { id: "classifier", title: "classifier.ts", meta: "src/sorter" },
  {
    id: "writer",
    title: "writer.ts",
    more: { label: "More actions for writer.ts", onClick: vi.fn() },
  },
  { id: "checker", title: "checker.ts", unavailable: { reason: "Still downloading" } },
  { id: "broken", title: "broken.ts", error: { reason: "File has an error", chip: "Error" } },
];

/** The Changes view's shape: rows open their diff, and are staged with the checkbox. */
function Changes({
  onOpen = vi.fn(),
  verb,
}: {
  readonly onOpen?: (id: string) => void;
  readonly verb?: string;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  return (
    <List
      label="Changes"
      rows={files}
      flush
      onOpen={onOpen}
      selection={{
        selected,
        multiple: true,
        ...(verb === undefined ? {} : { verb }),
        onToggle: (id) => {
          const next = new Set(selected);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          setSelected(next);
        },
      }}
    />
  );
}

function row(container: HTMLElement, index: number): HTMLTableRowElement {
  return container.querySelectorAll("tr")[index] as HTMLTableRowElement;
}

function cells(container: HTMLElement, index: number): HTMLElement[] {
  return Array.from(row(container, index).querySelectorAll('[role="gridcell"]'));
}

function boxIn(container: HTMLElement, index: number): HTMLInputElement {
  return row(container, index).querySelector('input[type="checkbox"]') as HTMLInputElement;
}

function press(element: Element, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

verifies("kit.list", () => {
  it("starts each row with a checkbox cell when the list both opens and selects rows", () => {
    const { container } = render(<Changes />);
    expect(cells(container, 0)).toHaveLength(2);
    expect(boxIn(container, 0).getAttribute("aria-label")).toBe("Select classifier.ts");
    const staged = render(<Changes verb="Stage" />);
    expect(boxIn(staged.container, 0).getAttribute("aria-label")).toBe("Stage classifier.ts");

    const onlyOpens = render(<List label="Agents" rows={files} onOpen={vi.fn()} />);
    expect(onlyOpens.container.querySelector('input[type="checkbox"]')).toBeNull();
    const onlySelects = render(
      <List label="Agents" rows={files} selection={{ selected: new Set(), onToggle: vi.fn() }} />,
    );
    expect(onlySelects.container.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it("selects on a click anywhere in the cell without opening, and the main cell still opens", async () => {
    const onOpen = vi.fn();
    const { container } = render(<Changes onOpen={onOpen} />);
    const [checkCell, mainCell] = cells(container, 0) as [HTMLElement, HTMLElement];

    await click(checkCell);
    expect(row(container, 0).getAttribute("aria-selected")).toBe("true");
    expect(boxIn(container, 0).checked).toBe(true);
    await click(boxIn(container, 0));
    expect(row(container, 0).getAttribute("aria-selected")).toBe("false");
    expect(boxIn(container, 0).checked).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();

    await click(mainCell);
    expect(onOpen).toHaveBeenCalledWith("classifier");
    expect(row(container, 0).getAttribute("aria-selected")).toBe("false");
  });

  it("puts focus on the box after a click in the cell outside it, and toggles once", async () => {
    const { container } = render(<Changes />);
    const checkCell = cells(container, 0)[0] as HTMLElement;
    await click(checkCell);
    expect(document.activeElement).toBe(boxIn(container, 0));
    expect(boxIn(container, 0).tabIndex).toBe(0);
    expect(row(container, 0).getAttribute("aria-selected")).toBe("true");

    // The box's touch target is its label: the click reaches the box once, not the cell as well.
    await click(boxIn(container, 0).parentElement as HTMLElement);
    expect(row(container, 0).getAttribute("aria-selected")).toBe("false");
  });

  it("draws the main cell's ring round the whole row, from the checkbox cell to the More cell", () => {
    const { container } = render(<Changes />);
    const [checkCell, mainCell] = cells(container, 1) as [HTMLElement, HTMLElement];
    expect(checkCell.className).toContain("focus-ring-row-start");
    expect(mainCell.className).toContain("focus-ring-row-middle");
    expect(row(container, 1).lastElementChild?.className).toContain("focus-ring-row-end");
    // The box keeps the Checkbox's own ring.
    expect(boxIn(container, 1).className).toContain("focus-ring");
  });

  it("keeps the main cell as the Tab stop, with the box at ← and the More button at →", () => {
    const { container } = render(<Changes />);
    const [box, mainCell, more] = [
      boxIn(container, 1),
      cells(container, 1)[1] as HTMLElement,
      row(container, 1).querySelector("button") as HTMLElement,
    ];
    expect(cells(container, 0)[1]?.tabIndex).toBe(0);
    expect(boxIn(container, 0).tabIndex).toBe(-1);

    act(() => mainCell.focus());
    press(mainCell, "ArrowLeft");
    expect(document.activeElement).toBe(box);
    press(box, "ArrowRight");
    expect(document.activeElement).toBe(mainCell);
    press(mainCell, "ArrowRight");
    expect(document.activeElement).toBe(more);
  });

  it("keeps an unavailable row's box focusable, described by its reason, and ignores clicks", async () => {
    const { container } = render(<Changes />);
    const box = boxIn(container, 2);
    const reason = document.getElementById(box.getAttribute("aria-describedby") ?? "");
    expect(box.getAttribute("aria-disabled")).toBe("true");
    expect(reason?.textContent).toBe("Still downloading");

    await click(cells(container, 2)[0] as HTMLElement);
    expect(document.activeElement).toBe(box);
    await click(box);
    expect(row(container, 2).getAttribute("aria-selected")).toBe("false");
    expect(box.checked).toBe(false);
    expect(cells(container, 2)[0]?.className).toContain("cursor-not-allowed");
  });

  it("keeps an error row selectable with a normal box", async () => {
    const { container } = render(<Changes />);
    const box = boxIn(container, 3);
    expect(box.className).not.toContain("border-danger");
    await click(box);
    expect(row(container, 3).getAttribute("aria-selected")).toBe("true");
  });

  it("is 44px, 48px on a phone or a touch screen, holds the gap, and carries the line and the bar", async () => {
    const { container } = render(<Changes />);
    const [checkCell, mainCell] = cells(container, 1) as [HTMLElement, HTMLElement];
    expect(checkCell.className).toContain("w-11 pl-4 touch:w-touch phone:w-touch");
    expect(checkCell.className).toContain("group/checkbox");
    expect(mainCell.firstElementChild?.className).toContain("pr-4");
    expect(mainCell.firstElementChild?.className).not.toContain("px-4");
    // In a flush list the line still starts at 16px, under the box; the main cell's runs on.
    expect(checkCell.className).toContain("before:left-4");
    expect(mainCell.className).toContain("border-t border-border");

    await click(checkCell);
    expect(checkCell.className).toContain("selected-bar");
    expect(mainCell.className).not.toContain("selected-bar");
    expect(mainCell.className).toContain("bg-accent-soft");
  });
});
