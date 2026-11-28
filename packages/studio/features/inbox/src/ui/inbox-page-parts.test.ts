import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { itemPaneClass, listPaneClass } from "./inbox-page-parts.tsx";

const classes = (value: string) => value.split(" ");

verifies("inbox.list-column", () => {
  it("makes the list 34 % of the page, at most 380px, beside the item, in either window", () => {
    for (const framed of [false, true]) {
      const list = classes(listPaneClass(false, true, framed));
      expect(list).toEqual(expect.arrayContaining(["w-[34%]", "max-w-95", "shrink-0"]));
      expect(classes(itemPaneClass(false, true, framed))).toContain("flex-1");
    }
  });

  it("lets the list fill the page one pane at a time", () => {
    const list = classes(listPaneClass(true, false));
    expect(list).toContain("w-full");
    expect(list).not.toContain("max-w-95");
  });
});
