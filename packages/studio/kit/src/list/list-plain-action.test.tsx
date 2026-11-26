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
    expect(action("notes").closest("td")?.className).toContain("w-0");
    expect(container.querySelector('tr[data-row-id="notes"]')?.className).toContain("relative");
  });

  it("hides the action and takes no clicks until the row is hovered or has focus", () => {
    const { action } = renderPlain([notes(() => undefined)]);
    const classes = action("notes").className.split(" ");
    expect(classes).toEqual(expect.arrayContaining(["opacity-0", "pointer-events-none"]));
    expect(classes).toEqual(
      expect.arrayContaining(["group-hover:opacity-100", "group-focus-within:opacity-100"]),
    );
    // It covers the trailing part with the row's hover fill.
    expect(classes).toEqual(expect.arrayContaining(["absolute", "bg-surface-muted"]));
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
    const column = dot?.parentElement;
    expect(column?.textContent).toBe("Latenew");
    expect(column?.className).toContain("flex-col");
    expect(cell("digest").querySelectorAll("[data-unread]")).toHaveLength(1);
  });
});
