// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { TickIcon } from "../icons/tick-icon.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { List } from "./list.tsx";
import type { ListRow } from "./list-props.ts";

afterEach(unmountAll);

function press(element: Element, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

const notes = (onClick: () => void): ListRow => ({
  id: "notes",
  title: "Approve the release notes",
  meta: "Release 0.2 · Liam",
  trailing: "3 h",
  hoverAction: {
    label: "Mark as read",
    spokenLabel: "Mark as read: release notes",
    icon: <TickIcon />,
    onClick,
  },
});

function renderRow(onClick: () => void, onOpen: (id: string) => void = () => undefined) {
  const { container } = render(
    <List heading={{ name: "Needs you" }} rows={[notes(onClick)]} onOpen={onOpen} plain />,
  );
  const cell = container.querySelector('tr[data-row-id="notes"] [role="gridcell"]') as HTMLElement;
  const action = container.querySelector('tr[data-row-id="notes"] button') as HTMLButtonElement;
  return { container, cell, action };
}

verifies("kit.list-plain-action-icon", () => {
  it("draws the action as an icon button named by its spoken label, its label in the tooltip", () => {
    const { container, action } = renderRow(() => undefined);
    expect(action.getAttribute("aria-label")).toBe("Mark as read: release notes");
    expect(action.textContent).toBe("");
    expect(action.querySelector("svg")).not.toBeNull();
    expect(action.className.split(" ")).toContain("size-6");
    expect(container.querySelector('[role="tooltip"]')?.textContent).toBe("Mark as read");
  });

  it("sits at the top right, on the row's fill, shown only on hover or keyboard focus", () => {
    const { action } = renderRow(() => undefined);
    const place = action.closest('[data-part="row-action"]');
    const classes = place?.className.split(" ") ?? [];
    expect(classes).toEqual(
      expect.arrayContaining(["absolute", "end-3", "top-3", "bg-surface-muted", "opacity-0"]),
    );
    expect(classes).toEqual(
      expect.arrayContaining(["group-hover:opacity-100", "group-has-[:focus-visible]:opacity-100"]),
    );
    // Its cell takes no width, so the row's text keeps the room up to the time.
    expect(action.closest("td")?.className.split(" ")).toEqual(
      expect.arrayContaining(["relative", "w-0"]),
    );
  });

  it("is reached with →, and Enter calls it without opening the row", () => {
    const onClick = vi.fn();
    const onOpen = vi.fn();
    const { cell, action } = renderRow(onClick, onOpen);
    act(() => cell.focus());
    press(cell, "ArrowRight");
    expect(document.activeElement).toBe(action);
    act(() => action.click());
    expect(onClick).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
