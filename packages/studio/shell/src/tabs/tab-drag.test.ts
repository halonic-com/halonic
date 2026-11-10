import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { dragTargetIndex } from "./tab-drag.ts";

const threeTabs = [
  { left: 0, width: 100 },
  { left: 100, width: 100 },
  { left: 200, width: 100 },
];

verifies("shell.window-tab-strip", () => {
  it("keeps a dragged tab in place until the pointer crosses a neighbour's middle", () => {
    expect(dragTargetIndex(140, threeTabs, 0)).toBe(0);
    expect(dragTargetIndex(160, threeTabs, 0)).toBe(1);
    expect(dragTargetIndex(260, threeTabs, 0)).toBe(2);
  });

  it("moves a tab left past the middles it crosses, and clamps at both ends", () => {
    expect(dragTargetIndex(160, threeTabs, 2)).toBe(2);
    expect(dragTargetIndex(140, threeTabs, 2)).toBe(1);
    expect(dragTargetIndex(40, threeTabs, 2)).toBe(0);
    expect(dragTargetIndex(-500, threeTabs, 1)).toBe(0);
    expect(dragTargetIndex(900, threeTabs, 1)).toBe(2);
  });
});
