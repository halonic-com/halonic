// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { StatusChip } from "../status-chip/status-chip.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { List } from "./list.tsx";
import type { ListRow } from "./list-props.ts";

afterEach(unmountAll);

function press(element: Element, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

function renderPlain(rows: readonly ListRow[], onOpen: (id: string) => void = () => undefined) {
  const { container } = render(
    <List heading={{ name: "Needs you" }} rows={rows} onOpen={onOpen} plain />,
  );
  const cell = (id: string) =>
    container.querySelector(`tr[data-row-id="${id}"] [role="gridcell"]`) as HTMLElement;
  const action = (id: string) =>
    container.querySelector<HTMLButtonElement>(
      `tr[data-row-id="${id}"] button`,
    ) as HTMLButtonElement;
  return { container, cell, action };
}

const notes = (onClick: () => void): ListRow => ({
  id: "notes",
  title: "Approve the release notes",
  meta: "Release 0.2 · Liam",
  hoverAction: { label: "Mark as unread", spokenLabel: "Mark as unread: release notes", onClick },
});

verifies("kit.list-plain-action", () => {
  it("reaches the hover action with →, and Enter calls it without opening the row", () => {
    const onClick = vi.fn();
    const onOpen = vi.fn();
    const { cell, action } = renderPlain([notes(onClick)], onOpen);
    act(() => cell("notes").focus());
    press(cell("notes"), "ArrowRight");
    expect(document.activeElement).toBe(action("notes"));
    expect(action("notes").getAttribute("aria-label")).toBe("Mark as unread: release notes");
    press(action("notes"), "ArrowLeft");
    expect(document.activeElement).toBe(cell("notes"));

    act(() => action("notes").click());
    expect(onClick).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("keeps the action in a cell of its own, out of the row's text and name", () => {
    const { container, cell, action } = renderPlain([notes(() => undefined)]);
    expect(cell("notes").contains(action("notes"))).toBe(false);
    expect(cell("notes").textContent).toBe("Approve the release notesRelease 0.2 · Liam");
    // The button is placed against its own cell, not the row: WebKit before April 2026 doesn't
    // make a `relative` table row a containing block (WebKit bug 240961).
    expect(action("notes").closest("td")?.className.split(" ")).toEqual(
      expect.arrayContaining(["relative", "w-0"]),
    );
    expect(container.querySelector('tr[data-row-id="notes"]')?.className).not.toContain("relative");
  });

  it("hides the action and takes no clicks until the row is hovered or has keyboard focus", () => {
    const { action } = renderPlain([notes(() => undefined)]);
    const classes = action("notes").className.split(" ");
    expect(classes).toEqual(expect.arrayContaining(["opacity-0", "pointer-events-none"]));
    // On the 72px row's first line (HAL-20675).
    expect(classes).toContain("top-4");
    expect(classes).toEqual(
      expect.arrayContaining(["group-hover:opacity-100", "group-has-[:focus-visible]:opacity-100"]),
    );
    // Not on any focus: a click leaves focus on the button, on a row without its fill.
    expect(classes).not.toContain("group-focus-within:opacity-100");
    // The row takes its fill on keyboard focus too, so the action never sits on a bare row.
    const fill = action("notes").closest("tr")?.querySelector('[role="gridcell"]')?.className;
    expect(fill?.split(" ")).toContain("group-has-[:focus-visible]:bg-surface-muted");
    // It covers the trailing part with the row's hover fill.
    expect(classes).toEqual(expect.arrayContaining(["absolute", "bg-surface-muted"]));
    // Its cell takes no width, so without this the label would wrap at every word.
    expect(classes).toContain("whitespace-nowrap");
  });

  it("draws no action in a List that isn't plain", () => {
    const { container } = render(
      <List
        heading={{ name: "Needs you" }}
        rows={[notes(() => undefined)]}
        onOpen={() => undefined}
      />,
    );
    expect(container.querySelector("button")).toBeNull();
  });

  it("takes no grid column in a List that isn't plain, so → reaches the row's More button", () => {
    const { container } = render(
      <List
        heading={{ name: "Needs you" }}
        rows={[{ ...notes(() => undefined), more: { label: "More", onClick: () => undefined } }]}
        onOpen={() => undefined}
      />,
    );
    const cell = container.querySelector(
      'tr[data-row-id="notes"] [role="gridcell"]',
    ) as HTMLElement;
    act(() => cell.focus());
    press(cell, "ArrowRight");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("More");
  });

  it("puts an unread row's dot under its trailing chip", () => {
    const late: ListRow = {
      id: "digest",
      title: "Send the weekly digest?",
      meta: "Weekly digest · run 0b44e1",
      trailing: <StatusChip tone="warning">Late</StatusChip>,
      unread: { label: "new" },
    };
    const { cell } = renderPlain([late]);
    const dot = cell("digest").querySelector("[data-unread]");
    const column = dot?.closest('[data-part="end-column"]');
    expect(column?.textContent).toBe("Latenew");
    // The chip at the top, on the title's first line; the dot at the bottom, on the meta line.
    expect(column?.className.split(" ")).toEqual(
      expect.arrayContaining(["flex-col", "justify-between"]),
    );
    expect(dot?.parentElement?.className.split(" ")).toContain("h-5");
    // The column stretches to the text's height: it shares a box with the text, not the row.
    expect(column?.parentElement?.firstElementChild?.textContent).toBe(
      "Send the weekly digest?Weekly digest · run 0b44e1",
    );
    expect(cell("digest").querySelectorAll("[data-unread]")).toHaveLength(1);
  });

  it("hides a row's chip while its action shows, so no edge of it shows round the action", () => {
    const late = (hoverAction?: ListRow["hoverAction"]): ListRow => ({
      id: "digest",
      title: "Send the weekly digest?",
      trailing: <StatusChip tone="warning">Late</StatusChip>,
      ...(hoverAction === undefined ? {} : { hoverAction }),
    });
    const chipOf = (row: ListRow) =>
      renderPlain([row]).cell("digest").querySelector('[data-part="end-column"]')
        ?.firstElementChild;
    const action = { label: "Mark as read", onClick: () => undefined };
    expect(chipOf(late(action))?.className.split(" ")).toEqual(
      expect.arrayContaining(["group-hover:opacity-0", "group-has-[:focus-visible]:opacity-0"]),
    );
    unmountAll();
    expect(chipOf(late())?.className).not.toContain("opacity-0");
  });
});
