// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { List, type ListProps, type ListRow } from "./list.tsx";

afterEach(() => {
  unmountAll();
});

const agents: readonly ListRow[] = [
  { id: "sorter", title: "Sorter", meta: "Sorts the inbox" },
  { id: "writer", title: "Writer", meta: "Drafts replies" },
  { id: "checker", title: "Checker" },
];

const withMore = (rows: readonly ListRow[], onClick = vi.fn()): ListRow[] =>
  rows.map((row) => ({ ...row, more: { label: `More actions for ${row.title}`, onClick } }));

function rowsIn(container: HTMLElement): HTMLTableRowElement[] {
  return Array.from(container.querySelectorAll("tr"));
}

function mainCell(container: HTMLElement, index: number): HTMLElement {
  return rowsIn(container)[index]?.querySelector('[role="gridcell"]') as HTMLElement;
}

function press(element: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  act(() => {
    element.dispatchEvent(event);
  });
  return event;
}

function focus(element: HTMLElement): void {
  act(() => element.focus());
}

/** A screen that keeps its own selection, as a real screen does. */
function Selectable(props: Partial<ListProps> & { readonly multiple?: boolean }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  return (
    <List
      label="Files"
      rows={agents}
      {...props}
      selection={{
        selected,
        multiple: props.multiple === true,
        onToggle: (id) => {
          const next = new Set(props.multiple === true ? selected : []);
          if (selected.has(id)) {
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

verifies("kit.list", () => {
  it("is a named grid of rows in one bordered box", () => {
    const { container } = render(<List label="Agents" rows={agents} />);
    const grid = container.querySelector('[role="grid"]') as HTMLElement;
    expect(grid.getAttribute("aria-label")).toBe("Agents");
    expect(rowsIn(container).map((row) => row.textContent)).toEqual([
      "SorterSorts the inbox",
      "WriterDrafts replies",
      "Checker",
    ]);
    expect(grid.parentElement?.className).toBe("overflow-hidden rounded-md border border-border");
    expect(mainCell(container, 0).className).not.toContain("border-t");
    expect(mainCell(container, 1).className).toContain("border-t border-border");
  });

  it("is named by its heading, drawn above the box", () => {
    const { container } = render(
      <List heading={{ name: "Acme", detail: "Workspace" }} headingLevel={3} rows={agents} />,
    );
    const heading = container.querySelector("h3") as HTMLElement;
    const grid = container.querySelector('[role="grid"]') as HTMLElement;
    expect(grid.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(grid.hasAttribute("aria-label")).toBe(false);
    expect(heading.nextElementSibling?.contains(grid)).toBe(true);
  });

  it("sizes rows 56px with a meta line, 40px without and 32px dense, padded 16px", () => {
    const { container } = render(<List label="Agents" rows={agents} />);
    const box = (index: number) => mainCell(container, index).firstElementChild?.className;
    expect(box(0)).toContain("min-h-14");
    expect(box(0)).toContain("gap-3 px-4");
    expect(box(2)).toContain("min-h-control-lg");
    const dense = render(<List label="Models" rows={agents} dense />);
    expect(mainCell(dense.container, 0).firstElementChild?.className).toContain("min-h-control-md");
  });

  it("shows the title strong, the meta muted and cut, and hides the icon from screen readers", () => {
    const rows = [{ ...agents[0], icon: <svg />, trailing: <span>Running</span> }] as ListRow[];
    const { container } = render(<List label="Agents" rows={rows} />);
    const [icon, text, trailing] = Array.from(
      mainCell(container, 0).firstElementChild?.children ?? [],
    );
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.className).toContain("size-icon-md");
    expect(text?.children[0]?.className).toBe("truncate text-body-strong text-fg");
    expect(text?.children[1]?.className).toBe("truncate text-small text-fg-muted");
    expect(trailing?.textContent).toBe("Running");
  });

  it("draws the icon 16px in a 32px dense row, and 20px again when a phone makes it 48px", () => {
    const rows = [{ ...agents[0], icon: <svg /> }] as ListRow[];
    const icon = (container: HTMLElement) =>
      mainCell(container, 0).firstElementChild?.firstElementChild?.className;
    expect(icon(render(<List label="Models" rows={rows} dense />).container)).toContain(
      "size-icon-sm",
    );
    const phone = render(
      <PresentationProvider presentation="phone">
        <List label="Models" rows={rows} dense />
      </PresentationProvider>,
    );
    expect(icon(phone.container)).toContain("size-icon-md");
  });

  it("has a hover and press fill, an inset focus ring, and an accent-soft fill and bar when selected", () => {
    const { container } = render(<Selectable />);
    expect(rowsIn(container)[0]?.className).toContain("hover:bg-surface-subtle");
    expect(mainCell(container, 0).className).toContain("focus-ring-inset");
    focus(mainCell(container, 0));
    press(mainCell(container, 0), " ");
    expect(rowsIn(container)[0]?.getAttribute("aria-selected")).toBe("true");
    expect(rowsIn(container)[0]?.className).toContain("bg-accent-soft");
    expect(rowsIn(container)[0]?.className).toContain("selected-forced");
    expect(mainCell(container, 0).className).toContain("selected-bar");
    expect(rowsIn(container)[1]?.getAttribute("aria-selected")).toBe("false");
    expect(rowsIn(container)[1]?.className).not.toContain("selected-forced");
    expect(mainCell(container, 1).className).not.toContain("selected-bar");
  });

  it("is one Tab stop, and the arrow keys, Home and End move between rows", () => {
    const { container } = render(<List label="Agents" rows={agents} />);
    const tabStops = () => rowsIn(container).map((_, index) => mainCell(container, index).tabIndex);
    expect(tabStops()).toEqual([0, -1, -1]);
    focus(mainCell(container, 0));
    expect(press(mainCell(container, 0), "ArrowDown").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(mainCell(container, 1));
    expect(tabStops()).toEqual([-1, 0, -1]);
    press(document.activeElement as HTMLElement, "End");
    expect(document.activeElement).toBe(mainCell(container, 2));
    expect(press(document.activeElement as HTMLElement, "ArrowDown").defaultPrevented).toBe(false);
    press(document.activeElement as HTMLElement, "Home");
    expect(document.activeElement).toBe(mainCell(container, 0));
    press(document.activeElement as HTMLElement, "ArrowUp");
    expect(document.activeElement).toBe(mainCell(container, 0));
  });

  it("opens a row on Enter or a click", async () => {
    const onOpen = vi.fn();
    const { container } = render(<List label="Agents" rows={agents} onOpen={onOpen} />);
    focus(mainCell(container, 1));
    press(mainCell(container, 1), "Enter");
    await click(mainCell(container, 2));
    expect(onOpen.mock.calls).toEqual([["writer"], ["checker"]]);
  });

  it("ignores the Enter that ends an input method's composition", () => {
    const onOpen = vi.fn();
    const { container } = render(<List label="Agents" rows={agents} onOpen={onOpen} />);
    act(() => {
      mainCell(container, 0).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true }),
      );
    });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("selects many rows with Space, or with a click when the list doesn't open rows", async () => {
    const { container } = render(<Selectable multiple />);
    const grid = container.querySelector('[role="grid"]') as HTMLElement;
    expect(grid.getAttribute("aria-multiselectable")).toBe("true");
    focus(mainCell(container, 0));
    press(mainCell(container, 0), " ");
    await click(mainCell(container, 2));
    expect(rowsIn(container).map((row) => row.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "true",
    ]);
  });

  it("reaches the More button with →, named for its row, and keeps its own Enter", async () => {
    const onMore = vi.fn();
    const onOpen = vi.fn();
    const { container } = render(
      <List label="Agents" rows={withMore(agents, onMore)} onOpen={onOpen} />,
    );
    const more = rowsIn(container)[0]?.querySelector("button") as HTMLButtonElement;
    expect(more.getAttribute("aria-label")).toBe("More actions for Sorter");
    expect(more.tabIndex).toBe(-1);
    expect(more.parentElement?.className).toContain("opacity-0 group-hover:opacity-100");
    expect(more.parentElement?.className).toContain("group-focus-within:opacity-100");
    expect(more.parentElement?.className).toContain("touch:opacity-100");
    focus(mainCell(container, 0));
    press(mainCell(container, 0), "ArrowRight");
    expect(document.activeElement).toBe(more);
    expect(more.tabIndex).toBe(0);
    press(more, "ArrowDown");
    expect(document.activeElement).toBe(rowsIn(container)[1]?.querySelector("button"));
    press(document.activeElement as HTMLElement, "Enter");
    await click(document.activeElement as HTMLElement);
    expect(onOpen).not.toHaveBeenCalled();
    expect(onMore).toHaveBeenCalledTimes(1);
    press(document.activeElement as HTMLElement, "ArrowLeft");
    expect(document.activeElement).toBe(mainCell(container, 1));
  });

  it("shows a disabled row in fg-disabled, still focusable, that can't be opened", async () => {
    const onOpen = vi.fn();
    const rows = [{ ...agents[0], avatar: <img alt="" />, disabled: true }] as ListRow[];
    const { container } = render(<List label="Agents" rows={rows} onOpen={onOpen} />);
    const [avatar, text] = Array.from(mainCell(container, 0).firstElementChild?.children ?? []);
    expect(rowsIn(container)[0]?.getAttribute("aria-disabled")).toBe("true");
    expect(avatar?.className).toContain("size-7");
    expect(avatar?.className).toContain("opacity-45");
    expect(text?.children[0]?.className).toContain("text-fg-disabled");
    expect(text?.children[1]?.className).toContain("text-fg-disabled");
    expect(mainCell(container, 0).tabIndex).toBe(0);
    focus(mainCell(container, 0));
    press(mainCell(container, 0), "Enter");
    await click(mainCell(container, 0));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("shows an error's reason in danger with a danger chip, and still opens", async () => {
    const onOpen = vi.fn();
    const rows = [
      {
        ...agents[0],
        trailing: <span>Ready</span>,
        error: { reason: "File has an error", chip: "Error" },
      },
    ] as ListRow[];
    const { container } = render(<List label="Agents" rows={rows} onOpen={onOpen} />);
    const cell = mainCell(container, 0);
    expect(cell.textContent).toBe("SorterFile has an errorError");
    expect(cell.querySelector(".text-danger")?.textContent).toBe("File has an error");
    expect(cell.querySelector(".bg-danger-soft")?.textContent).toBe("Error");
    await click(cell);
    expect(onOpen).toHaveBeenCalledWith("sorter");
  });

  it("is flush on a phone, with lines from 16px, taller rows and the More button always shown", () => {
    const rows = withMore(agents).map((row, index) =>
      index === 0 ? { ...row, trailing: <span>Test</span> } : row,
    );
    const { container } = render(
      <PresentationProvider presentation="phone">
        <List label="Agents" rows={rows} />
      </PresentationProvider>,
    );
    const grid = container.querySelector('[role="grid"]') as HTMLElement;
    expect(grid.parentElement?.className).toBe("");
    expect(mainCell(container, 1).className).toContain(
      "before:left-4 before:h-px before:bg-border",
    );
    expect(mainCell(container, 0).firstElementChild?.className).toContain("min-h-14 py-3");
    const more = rowsIn(container)[0]?.querySelector("button")?.parentElement;
    expect(more?.className).not.toContain("opacity-0");
    // One job on the right edge: the chip moves under the text, next to the More button.
    expect(mainCell(container, 0).querySelector(".mt-1")?.textContent).toBe("Test");
  });

  it("moves focus to the row that took a removed row's place, else the one before", () => {
    const { container, rerender } = render(<List label="Agents" rows={agents} />);
    focus(mainCell(container, 1));
    rerender(<List label="Agents" rows={[agents[0], agents[2]] as ListRow[]} />);
    expect(document.activeElement?.textContent).toBe("Checker");
    rerender(<List label="Agents" rows={[agents[0]] as ListRow[]} />);
    expect(document.activeElement?.textContent).toBe("SorterSorts the inbox");
  });
});
