// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { type GridRow, useGridNavigation } from "./use-grid-navigation.ts";

afterEach(() => {
  unmountAll();
});

/** The Inbox's shape (L3): a heading row, then rows of name, link and ×, some cells empty. */
const inbox: readonly GridRow[] = [
  { id: "heading-today", cells: [] },
  { id: "invoice", cells: [true, true, true] },
  { id: "notice", cells: [true, false, true] },
  { id: "heading-earlier", cells: [] },
  { id: "reply", cells: [true, true, false] },
];

function Grid({ rows }: { readonly rows: readonly GridRow[] }) {
  const grid = useGridNavigation(rows);
  // The hook needs no roles: the List puts them on its table, so this test leaves them out.
  return (
    <table aria-label="Inbox" {...grid.gridProps}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {row.cells.map((focusable, column) => (
              <td key={column}>
                {focusable ? (
                  <button type="button" {...grid.cell(row.id, column)}>
                    {`${row.id} ${column}`}
                  </button>
                ) : null}
              </td>
            ))}
            {row.cells.length === 0 ? <th>{row.id}</th> : null}
          </tr>
        ))}
        <tr>
          <td>
            <input aria-label="Filter" />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function press(key: string): void {
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

function focused(): string | undefined {
  return document.activeElement?.textContent ?? undefined;
}

verifies("kit.grid-navigation", () => {
  it("puts the first focusable cell in the Tab order, past a heading row", () => {
    const { container } = render(<Grid rows={inbox} />);
    const tabStops = Array.from(container.querySelectorAll("button")).filter(
      (button) => button.tabIndex === 0,
    );
    expect(tabStops.map((button) => button.textContent)).toEqual(["invoice 0"]);
  });

  it("passes over heading rows and empty cells", () => {
    const { container } = render(<Grid rows={inbox} />);
    act(() => container.querySelector("button")?.focus());
    press("ArrowRight");
    expect(focused()).toBe("invoice 1");
    press("ArrowDown");
    // The notice has no link: the nearest cell to the left.
    expect(focused()).toBe("notice 0");
    press("ArrowRight");
    expect(focused()).toBe("notice 2");
    press("ArrowDown");
    // Past the heading; the reply has no ×, so its link.
    expect(focused()).toBe("reply 1");
    press("ArrowRight");
    expect(focused()).toBe("reply 1");
    press("Home");
    expect(focused()).toBe("invoice 1");
    press("End");
    expect(focused()).toBe("reply 1");
  });

  it("leaves keys alone that come from inside a cell or with Alt", () => {
    const { container } = render(<Grid rows={inbox} />);
    act(() => container.querySelector("input")?.focus());
    press("ArrowDown");
    expect(document.activeElement?.tagName).toBe("INPUT");
    act(() => container.querySelector("button")?.focus());
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }),
      );
    });
    expect(focused()).toBe("invoice 0");
  });

  it("has no Tab stop when no row can take focus", () => {
    const { container } = render(<Grid rows={[{ id: "heading", cells: [] }]} />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});
