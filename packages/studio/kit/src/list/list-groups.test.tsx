// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { List } from "./list.tsx";
import type { ListGroup } from "./list-props.ts";

afterEach(() => {
  vi.useRealTimers();
  unmountAll();
});

const sorter = { id: "sorter", title: "Sorter", meta: "In Draft" };
const writer = { id: "writer", title: "Writer", meta: "Sent nothing" };
const checker = { id: "checker", title: "Checker", meta: "Sent 1 email" };

const today: ListGroup = { id: "2026-11-12", heading: { name: "Today" }, rows: [sorter, writer] };
const yesterday: ListGroup = { id: "2026-11-11", heading: { name: "Yesterday" }, rows: [checker] };
const lastWeek: ListGroup = { id: "2026-11-05", heading: { name: "Last week" }, rows: [] };

function cellOf(container: HTMLElement, title: string): HTMLElement {
  const cells = Array.from(container.querySelectorAll<HTMLElement>('[role="gridcell"]'));
  const cell = cells.find((candidate) => candidate.textContent?.includes(title));
  if (cell === undefined) {
    throw new Error(`No row ${title}`);
  }
  return cell;
}

/** A cell's classes, one by one: "border-b" mustn't match "border-border". */
function classesOf(element: HTMLElement): string[] {
  return element.className.split(/\s+/);
}

function press(element: Element, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

function focus(element: HTMLElement): void {
  act(() => element.focus());
}

verifies("kit.list-groups", () => {
  it("is one grid named by its label, with one Tab stop, and each group under its heading", () => {
    const { container } = render(<List label="Runs" groups={[today, yesterday]} />);
    const grids = container.querySelectorAll('[role="grid"]');
    expect(grids).toHaveLength(1);
    expect(grids[0]?.getAttribute("aria-label")).toBe("Runs");
    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    const headings = Array.from(container.querySelectorAll("h3")).map((h) => h.textContent);
    expect(headings).toEqual(["Today", "Yesterday"]);
  });

  it("spans the heading across every column, with nothing in it that takes focus", () => {
    const more = { label: "More actions", onClick: () => undefined };
    const withMore: ListGroup = { ...today, rows: [{ ...sorter, more }, writer] };
    const { container } = render(
      <List
        label="Runs"
        groups={[withMore]}
        onOpen={() => undefined}
        selection={{ selected: new Set<string>(), onToggle: () => undefined }}
      />,
    );
    // The checkbox, the row and the More button.
    const headingCell = container.querySelector("h3")?.closest("td");
    expect(headingCell?.getAttribute("colspan")).toBe("3");
    expect(headingCell?.hasAttribute("tabindex")).toBe(false);
    expect(headingCell?.querySelector("[tabindex]")).toBeNull();
  });

  it("names each group's rows by its heading", () => {
    const { container } = render(<List label="Runs" groups={[today, yesterday]} />);
    const bodies = Array.from(container.querySelectorAll("tbody"));
    const names = bodies.map(
      (body) => document.getElementById(body.getAttribute("aria-labelledby") ?? "")?.textContent,
    );
    expect(names).toEqual(["Today", "Yesterday"]);
  });

  it("passes over the headings with the arrow keys, Home and End", () => {
    const { container } = render(<List label="Runs" groups={[today, yesterday]} />);
    focus(cellOf(container, "Writer"));
    press(cellOf(container, "Writer"), "ArrowDown");
    expect(document.activeElement).toBe(cellOf(container, "Checker"));
    press(cellOf(container, "Checker"), "ArrowUp");
    expect(document.activeElement).toBe(cellOf(container, "Writer"));
    press(cellOf(container, "Writer"), "Home");
    expect(document.activeElement).toBe(cellOf(container, "Sorter"));
    press(cellOf(container, "Sorter"), "End");
    expect(document.activeElement).toBe(cellOf(container, "Checker"));
  });

  it("takes a heading level", () => {
    const { container } = render(<List label="Runs" groups={[today]} groupHeadingLevel={4} />);
    expect(container.querySelector("h4")?.textContent).toBe("Today");
    // @ts-expect-error: a grouped List has no heading of its own, so no `headingLevel`.
    const misnamed = <List label="Runs" groups={[today]} headingLevel={4} />;
    expect(misnamed).toBeDefined();
  });

  it("draws no group without rows, heading and all", () => {
    const { container } = render(<List label="Runs" groups={[today, lastWeek, yesterday]} />);
    expect(container.textContent).not.toContain("Last week");
    expect(container.querySelectorAll("tbody")).toHaveLength(2);
  });

  it("draws each group's box with its cells, not round the whole list", () => {
    const { container } = render(<List label="Runs" groups={[today, yesterday]} />);
    expect(container.querySelector("table")?.parentElement?.className).not.toContain("border");
    const first = cellOf(container, "Sorter");
    const last = cellOf(container, "Writer");
    const only = cellOf(container, "Checker");
    expect(classesOf(first)).toContain("rounded-tl-md");
    expect(classesOf(first)).toContain("border-t");
    expect(classesOf(first)).toContain("border-l");
    expect(classesOf(first)).toContain("border-r");
    expect(classesOf(first)).not.toContain("border-b");
    expect(classesOf(last)).toContain("border-b");
    expect(classesOf(last)).toContain("rounded-br-md");
    expect(classesOf(only)).toContain("rounded-tl-md");
    expect(classesOf(only)).toContain("rounded-bl-md");
  });

  it("draws no boxes on a phone, and no line above a group's first row", () => {
    const { container } = render(
      <PresentationProvider presentation="phone">
        <List label="Runs" groups={[today, yesterday]} />
      </PresentationProvider>,
    );
    const first = cellOf(container, "Sorter");
    expect(first.className).not.toMatch(/\bborder-[tlrb]\b|rounded/);
    expect(classesOf(cellOf(container, "Writer"))).toContain("before:border-t");
  });

  it("moves focus across groups when the focused row goes, never to a heading", () => {
    const { container, rerender } = render(<List label="Runs" groups={[today, yesterday]} />);
    focus(cellOf(container, "Checker"));
    rerender(<List label="Runs" groups={[today, { ...yesterday, rows: [] }]} />);
    expect(container.textContent).not.toContain("Yesterday");
    expect(document.activeElement).toBe(cellOf(container, "Writer"));
  });

  it("shows a heading bar above the skeleton's box while it loads", () => {
    vi.useFakeTimers();
    const { container } = render(
      <List label="Runs" groups={[]} loading loadingLabel="Loading runs" />,
    );
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const bar = container.querySelector('[aria-busy="true"] .w-12');
    expect(bar).not.toBeNull();
    // Above the box, where the first group's heading goes, not inside it.
    expect(bar?.closest(".rounded-md")).toBeNull();
  });
});
