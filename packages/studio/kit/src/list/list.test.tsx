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

function press(element: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    element.dispatchEvent(event);
  });
  return event;
}

function focus(element: HTMLElement): void {
  act(() => element.focus());
}

async function clickWith(element: Element, init: MouseEventInit): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
  });
}

/** A screen that keeps its own selection, as a real screen does. */
function Selectable(
  props: Partial<Omit<ListProps, "heading" | "label">> & { readonly multiple?: boolean },
) {
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
    // No overflow-hidden, which would cut the first and last rows' focus rings: the corner cells
    // are rounded instead.
    expect(grid.parentElement?.className).toBe("rounded-md border border-border");
    expect(mainCell(container, 0).className).toContain("rounded-tl-md");
    expect(mainCell(container, 0).className).toContain("rounded-tr-md");
    expect(mainCell(container, 2).className).toContain("rounded-bl-md");
    expect(mainCell(container, 2).className).toContain("rounded-br-md");
    expect(mainCell(container, 1).className).not.toContain("rounded");
    expect(mainCell(container, 0).className).not.toContain("border-t");
    expect(mainCell(container, 1).className).toContain("border-t border-border");
  });

  it("must have a name: a heading or a label, never both", () => {
    // @ts-expect-error: neither a heading nor a label
    const nameless = <List rows={agents} />;
    // @ts-expect-error: both a heading and a label
    const twice = <List heading={{ name: "Agents" }} label="Agents" rows={agents} />;
    expect([nameless, twice]).toHaveLength(2);
  });

  it("is named by its heading, drawn as the box's first line", () => {
    const { container } = render(
      <List heading={{ name: "Acme", detail: "Workspace" }} headingLevel={3} rows={agents} />,
    );
    const heading = container.querySelector("h3") as HTMLElement;
    const grid = container.querySelector('[role="grid"]') as HTMLElement;
    expect(grid.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(grid.hasAttribute("aria-label")).toBe(false);
    expect(heading.parentElement?.className).toBe("rounded-md border border-border");
    expect(heading.nextElementSibling).toBe(grid);
    // The first row sits under the heading, not in the box's top corners.
    expect(mainCell(container, 0).className).not.toContain("rounded-t");
    expect(mainCell(container, 2).className).toContain("rounded-bl-md");
  });

  it("sizes rows 56px with a meta line, 40px without and 32px dense, padded 16px", () => {
    const { container } = render(<List label="Agents" rows={agents} />);
    const box = (index: number) => mainCell(container, index).firstElementChild?.className;
    expect(box(0)).toContain("min-h-14");
    expect(box(0)).toContain("gap-3 px-4");
    expect(box(2)).toContain("min-h-control-lg");
    // At least 48px under a coarse pointer, at any width (23.5).
    expect(box(2)).toContain("touch:min-h-touch");
    const dense = render(<List label="Models" rows={withMore(agents)} dense />);
    const denseBox = mainCell(dense.container, 0).firstElementChild?.className;
    expect(denseBox).toContain("min-h-control-md touch:min-h-touch");
    // A 28px More button, clear of the 32px row's lines; its ring overlaps them and isn't clipped.
    const more = rowsIn(dense.container)[0]?.querySelector("button") as HTMLButtonElement;
    expect(more.className).toContain("size-control-sm");
    expect(more.parentElement?.className).toContain("touch:pr-1");
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

  it("draws the icon 16px in a 32px dense row, and 20px again when a phone or a coarse pointer makes it 48px", () => {
    const rows = [{ ...agents[0], icon: <svg /> }] as ListRow[];
    const icon = (container: HTMLElement) =>
      mainCell(container, 0).firstElementChild?.firstElementChild?.className;
    const desktop = icon(render(<List label="Models" rows={rows} dense />).container);
    expect(desktop).toContain("size-icon-sm");
    // Under a coarse pointer the row grows to 48px (touch:min-h-touch), and the icon with it.
    expect(desktop).toContain("touch:size-icon-md");
    const phone = render(
      <PresentationProvider presentation="phone">
        <List label="Models" rows={rows} dense />
      </PresentationProvider>,
    );
    expect(icon(phone.container)).toContain("size-icon-md");
  });

  it("has a fading hover and press fill, an inset focus ring, and an accent-soft fill and bar when selected", () => {
    const { container } = render(<Selectable rows={withMore(agents)} />);
    expect(mainCell(container, 0).className).toContain(
      "transition-colors group-hover:bg-surface-subtle group-active:bg-surface-subtle",
    );
    // With a More column the ring goes round the whole row, drawn half by each cell.
    expect(mainCell(container, 0).className).toContain("focus-ring-row-start");
    expect(mainCell(container, 0).className).not.toContain("focus-ring-inset");
    expect(rowsIn(container)[0]?.lastElementChild?.className).toContain("focus-ring-row-end");
    const alone = render(<List label="Agents" rows={agents} />);
    expect(mainCell(alone.container, 0).className).toContain("focus-ring-inset");
    focus(mainCell(container, 0));
    press(mainCell(container, 0), " ");
    expect(rowsIn(container)[0]?.getAttribute("aria-selected")).toBe("true");
    expect(mainCell(container, 0).className).toContain("bg-accent-soft");
    // The bar on the main cell and the outline on the row, so no outline line between the cells.
    expect(mainCell(container, 0).className).toContain("selected-bar");
    expect(rowsIn(container)[0]?.className).toContain("selected-forced");
    const moreCell = rowsIn(container)[0]?.querySelector("button")?.parentElement;
    expect(moreCell?.className).toContain("bg-accent-soft");
    expect(moreCell?.className).not.toContain("selected-bar");
    expect(moreCell?.className).not.toContain("selected-forced");
    expect(rowsIn(container)[1]?.getAttribute("aria-selected")).toBe("false");
    expect(rowsIn(container)[1]?.className).not.toContain("selected-forced");
    expect(mainCell(container, 1).className).not.toContain("selected-bar");
  });

  it("insets a bordered box's first and last selected bars 8px, inside the rounded corners", () => {
    const { container } = render(<Selectable />);
    focus(mainCell(container, 0));
    press(mainCell(container, 0), " ");
    expect(mainCell(container, 0).className).toContain("after:top-2");
    expect(mainCell(container, 0).className).not.toContain("after:bottom-2");
    press(mainCell(container, 0), "End");
    press(mainCell(container, 2), " ");
    expect(mainCell(container, 2).className).toContain("selected-bar");
    expect(mainCell(container, 2).className).toContain("after:bottom-2");
    expect(mainCell(container, 0).className).not.toContain("after:top-2");
    // A flush list has no corners, so its bar keeps the 6px inset.
    const flush = render(<Selectable flush />);
    focus(mainCell(flush.container, 0));
    press(mainCell(flush.container, 0), " ");
    expect(mainCell(flush.container, 0).className).toContain("selected-bar");
    expect(mainCell(flush.container, 0).className).not.toContain("after:top-2");
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
    // At the end focus stays, and the page doesn't scroll either.
    expect(press(document.activeElement as HTMLElement, "ArrowDown").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(mainCell(container, 2));
    // Nor does Space, in a list without selection.
    expect(press(document.activeElement as HTMLElement, " ").defaultPrevented).toBe(true);
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

  it("opens a new tab on Ctrl Enter, ⌘ Enter, a Ctrl-click or a middle click", async () => {
    const onOpen = vi.fn();
    const onOpenInNewTab = vi.fn();
    const { container } = render(
      <List label="Runs" rows={agents} onOpen={onOpen} onOpenInNewTab={onOpenInNewTab} />,
    );
    focus(mainCell(container, 0));
    expect(press(mainCell(container, 0), "Enter", { ctrlKey: true }).defaultPrevented).toBe(true);
    press(mainCell(container, 0), "Enter", { metaKey: true });
    await clickWith(mainCell(container, 1), { ctrlKey: true });
    await act(async () => {
      mainCell(container, 2).dispatchEvent(
        new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }),
      );
    });
    expect(onOpenInNewTab.mock.calls).toEqual([["sorter"], ["sorter"], ["writer"], ["checker"]]);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does nothing on a modified Enter or click when there's no new tab to open", async () => {
    const onOpen = vi.fn();
    const { container } = render(<List label="Files" rows={agents} onOpen={onOpen} />);
    focus(mainCell(container, 0));
    press(mainCell(container, 0), "Enter", { ctrlKey: true });
    press(mainCell(container, 0), "Enter", { shiftKey: true });
    await clickWith(mainCell(container, 1), { metaKey: true });
    await clickWith(mainCell(container, 1), { altKey: true });
    expect(onOpen).not.toHaveBeenCalled();
    press(mainCell(container, 0), "Enter");
    expect(onOpen).toHaveBeenCalledWith("sorter");
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
    // Always shown, dimmed until hovered; the cell is never faded, so its line and fill stay.
    expect(more.className).toContain("text-fg-muted");
    expect(more.className).toContain("hover:text-fg");
    expect(more.parentElement?.className).not.toContain("opacity");
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

  it("shows an unavailable row's reason, linked, with no hover, that can't be opened", async () => {
    const onOpen = vi.fn();
    const rows = [
      {
        ...agents[0],
        avatar: <img alt="" />,
        unavailable: { reason: "Waiting for the model to download" },
      },
    ] as ListRow[];
    const { container } = render(<List label="Agents" rows={rows} onOpen={onOpen} />);
    const cell = mainCell(container, 0);
    const [avatar, text] = Array.from(cell.firstElementChild?.children ?? []);
    expect(rowsIn(container)[0]?.getAttribute("aria-disabled")).toBe("true");
    expect(avatar?.className).toContain("size-7");
    expect(avatar?.className).toContain("opacity-45");
    expect(text?.children[0]?.className).toContain("text-fg-disabled text-forced-disabled");
    // The reason replaces the meta line, at full strength, and is read with the row.
    const reason = text?.children[1] as HTMLElement;
    expect(reason.textContent).toBe("Waiting for the model to download");
    expect(reason.className).toContain("text-fg-muted");
    expect(reason.className).not.toContain("text-forced-disabled");
    expect(cell.getAttribute("aria-describedby")).toBe(reason.id);
    expect(cell.className).not.toContain("hover:");
    expect(cell.className).not.toContain("active:");
    expect(cell.className).toContain("cursor-not-allowed");
    expect(cell.tabIndex).toBe(0);
    focus(mainCell(container, 0));
    press(mainCell(container, 0), "Enter");
    await click(mainCell(container, 0));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("dims an unavailable row's title and icon to GrayText in high contrast, but not its reason", () => {
    const rows = [
      { ...agents[0], icon: <svg />, unavailable: { reason: "Waiting for the model to download" } },
      { ...agents[1], icon: <svg /> },
    ] as ListRow[];
    const { container } = render(<List label="Agents" rows={rows} />);
    const parts = (index: number) => {
      const [icon, text] = Array.from(mainCell(container, index).firstElementChild?.children ?? []);
      return { icon, title: text?.children[0], meta: text?.children[1] };
    };
    expect(parts(0).icon?.className).toContain("text-forced-disabled");
    expect(parts(0).title?.className).toContain("text-forced-disabled");
    expect(parts(0).meta?.className).not.toContain("text-forced-disabled");
    expect(parts(1).icon?.className).not.toContain("text-forced-disabled");
    expect(parts(1).title?.className).not.toContain("text-forced-disabled");
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
    // The dot, so the error doesn't rest on colour alone.
    expect(cell.querySelector(".bg-danger-soft > .rounded-full")).not.toBeNull();
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
    // A border, not a fill, so it stays in forced colours.
    expect(mainCell(container, 1).className).toContain(
      "before:left-4 before:h-0 before:border-t before:border-border",
    );
    expect(mainCell(container, 0).firstElementChild?.className).toContain("min-h-14 py-3");
    const more = rowsIn(container)[0]?.querySelector("button")?.parentElement;
    expect(more?.className).not.toContain("opacity-0");
    // One job on the right edge: next to the More button, the chip starts the meta line.
    const text = mainCell(container, 0).firstElementChild?.firstElementChild;
    expect(text?.children).toHaveLength(2);
    expect(text?.children[1]?.textContent).toBe("TestSorts the inbox");
    expect(text?.children[1]?.className).toContain("gap-1.5");
    expect(text?.children[1]?.lastElementChild?.firstElementChild?.className).toContain("truncate");
  });

  it("moves focus to the row that took a removed row's place, else the one before", () => {
    const { container, rerender } = render(<List label="Agents" rows={agents} />);
    focus(mainCell(container, 1));
    rerender(<List label="Agents" rows={[agents[0], agents[2]] as ListRow[]} />);
    expect(document.activeElement?.textContent).toBe("Checker");
    rerender(<List label="Agents" rows={[agents[0]] as ListRow[]} />);
    expect(document.activeElement?.textContent).toBe("SorterSorts the inbox");
  });

  it("shows its Empty state in place of the box when there are no rows, a level below the heading", () => {
    const { container } = render(
      <List
        heading={{ name: "Agents" }}
        rows={[]}
        empty={{ title: "No agents yet", description: "Agents do the work." }}
      />,
    );
    expect(container.querySelector("h2")?.textContent).toBe("Agents");
    expect(container.querySelector("h3")?.textContent).toBe("No agents yet");
    expect(container.querySelector('[role="grid"]')).toBeNull();
  });

  it("keeps the box, empty, without `empty`, and an Empty state's own level", () => {
    const { container } = render(<List label="Agents" rows={[]} />);
    expect(container.querySelector('[role="grid"]')).not.toBeNull();
    const own = render(
      <List label="Agents" rows={[]} empty={{ title: "No agents yet", headingLevel: 4 }} />,
    );
    expect(own.container.querySelector("h4")?.textContent).toBe("No agents yet");
  });

  it("moves focus to the Empty state's title when the last row goes, and leaves focus elsewhere", () => {
    const empty = { title: "No agents yet" };
    const { container, rerender } = render(
      <List label="Agents" rows={[agents[0]] as ListRow[]} empty={empty} />,
    );
    focus(mainCell(container, 0));
    rerender(<List label="Agents" rows={[]} empty={empty} />);
    expect(document.activeElement?.textContent).toBe("No agents yet");

    const outside = document.createElement("button");
    document.body.append(outside);
    rerender(<List label="Agents" rows={[agents[0]] as ListRow[]} empty={empty} />);
    focus(outside);
    rerender(<List label="Agents" rows={[]} empty={empty} />);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
