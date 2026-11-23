// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { List } from "./list.tsx";
import type { ListRow } from "./list-props.ts";

afterEach(() => {
  unmountAll();
});

const wait: ListRow = {
  id: "wait_891b5a",
  title: "Approve this reply?",
  meta: (
    <>
      Support reply · run 891b5a · a person step · Waiting 1 h
      <span className="sr-only">, since 09:00</span>
    </>
  ),
};

/** The row's text column: the title, then the meta line. */
function textParts(row: ListRow): Element[] {
  const { container } = render(<List label="Needs you" rows={[row]} />);
  const cell = container.querySelector('[role="gridcell"]');
  return Array.from(cell?.firstElementChild?.children[0]?.children ?? []);
}

verifies("kit.list-wrap-meta", () => {
  it("wraps the meta line onto two lines, then cuts it, and lets the row grow", () => {
    const [title, meta] = textParts({ ...wait, wrapMeta: true });
    expect(meta?.className).toContain("line-clamp-2");
    expect(meta?.className).toContain("wrap-break-word");
    expect(meta?.className).not.toContain("truncate");
    // `relative`, so the clip holds its screen-reader-only words too.
    expect(meta?.className).toContain("relative");
    expect(meta?.querySelector(".sr-only")?.textContent).toBe(", since 09:00");
    expect(title?.className).toContain("truncate");
    expect(title?.parentElement?.parentElement?.className).toContain("py-2");
  });

  it("keeps the meta line of a row without wrapMeta on one line", () => {
    const [, meta] = textParts(wait);
    expect(meta?.className).toContain("truncate");
    expect(meta?.className).not.toContain("line-clamp-2");
  });
});
