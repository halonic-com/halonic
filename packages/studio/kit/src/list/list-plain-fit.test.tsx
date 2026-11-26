// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { List } from "./list.tsx";
import type { ListRow } from "./list-props.ts";

afterEach(unmountAll);

const refund: ListRow = {
  id: "refund",
  title: "Approve the refund for the Acme order from last week",
  meta: "Support reply · run 891b5a · a person step",
  metaEnd: " · Waiting 1 h",
  wrapTitle: true,
  wrapMeta: true,
};

/** The row's main cell, its text column's title and meta line, in a plain List or not. */
function rowParts(row: ListRow, plain: boolean) {
  const { container } = render(
    <List label="Needs you" rows={[row]} onOpen={() => undefined} plain={plain} />,
  );
  const inside = container.querySelector('[role="gridcell"]')?.firstElementChild;
  const [title, meta] = Array.from(inside?.querySelector(":scope > .flex-col")?.children ?? []);
  return { cell: container.querySelector('[role="gridcell"]'), inside, title, meta };
}

const classesOf = (element: Element | null | undefined) => element?.className.split(" ") ?? [];

verifies("kit.plain-row-fit", () => {
  it("clamps a plain row's title to two 20px lines and keeps its meta line on one", () => {
    const { inside, title, meta } = rowParts(refund, true);
    expect(classesOf(title)).toEqual(expect.arrayContaining(["line-clamp-2", "leading-5"]));
    expect(classesOf(meta)).not.toContain("line-clamp-2");
    expect(meta?.querySelector("span")?.className).toContain("truncate");
    // 10px above and below and the text's 60px: the row keeps its 80px, and centres a short title.
    expect(classesOf(inside)).toEqual(
      expect.arrayContaining(["min-h-20", "py-2.5", "items-center"]),
    );
  });

  it("keeps the whole title and line in what screen readers hear", () => {
    const { cell } = rowParts(refund, true);
    expect(cell?.textContent).toContain(
      "Approve the refund for the Acme order from last weekSupport reply · run 891b5a · a person step · Waiting 1 h",
    );
  });

  it("lets a row that isn't plain wrap as before", () => {
    const { title, meta } = rowParts(refund, false);
    expect(classesOf(title)).toContain("wrap-break-word");
    expect(classesOf(title)).not.toContain("line-clamp-2");
    expect(classesOf(meta)).toContain("line-clamp-2");
  });
});

verifies("kit.list-meta-end", () => {
  it("cuts only the text before the end on a one-line meta line", () => {
    const { meta } = rowParts(refund, true);
    const [text, end] = Array.from(meta?.children ?? []);
    expect(classesOf(text)).toEqual(expect.arrayContaining(["min-w-0", "truncate"]));
    expect(end?.textContent).toBe(" · Waiting 1 h");
    expect(classesOf(end)).toEqual(expect.arrayContaining(["shrink-0", "whitespace-pre"]));
  });

  it("makes the end part of the text when the meta line wraps", () => {
    const { meta } = rowParts(refund, false);
    expect(meta?.children).toHaveLength(0);
    expect(meta?.textContent).toBe("Support reply · run 891b5a · a person step · Waiting 1 h");
  });

  it("drops the end when an error's reason takes the line's place", () => {
    const { meta } = rowParts(
      { ...refund, error: { reason: "The run stopped.", chip: "Failed" } },
      true,
    );
    expect(meta?.textContent).toBe("The run stopped.");
    expect(meta?.querySelector('[data-part="meta-end"]')).toBeNull();
  });
});
