import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { autoLayout, boxesFor } from "./auto-layout.ts";
import { CARD_SIZE } from "./geometry.ts";

verifies("workflows.canvas.auto-layout", () => {
  it("puts the first step on top and the next one below it", () => {
    const placed = autoLayout(["start", "done"], [{ from: "start", to: "done" }], "start");
    expect(placed.get("start")).toEqual({ x: 0, y: 0 });
    expect(placed.get("done")).toEqual({ x: 0, y: CARD_SIZE.height + 64 });
  });

  it("puts steps that share a row side by side, in the file's order", () => {
    const placed = autoLayout(
      ["start", "b", "a"],
      [
        { from: "start", to: "a" },
        { from: "start", to: "b" },
      ],
      "start",
    );
    expect(placed.get("b")?.y).toBe(placed.get("a")?.y);
    expect(placed.get("b")?.x).toBeLessThan(placed.get("a")?.x ?? 0);
  });

  it("doesn't move a step up for an arrow that points back", () => {
    const placed = autoLayout(
      ["start", "b"],
      [
        { from: "start", to: "b" },
        { from: "b", to: "start" },
      ],
      "start",
    );
    expect(placed.get("b")?.y).toBeGreaterThan(0);
    expect(placed.get("start")).toEqual({ x: 0, y: 0 });
  });

  it("puts a step the first step can't reach in a row of its own at the bottom", () => {
    const placed = autoLayout(["start", "done", "lost"], [{ from: "start", to: "done" }], "start");
    expect(placed.get("lost")?.y).toBeGreaterThan(placed.get("done")?.y ?? 0);
  });

  it("keeps a place the person chose and places only the others", () => {
    const boxes = boxesFor(["start", "done"], [{ from: "start", to: "done" }], "start", {
      done: { x: 500, y: 40 },
    });
    expect(boxes.get("done")).toEqual({ x: 500, y: 40, ...CARD_SIZE });
    expect(boxes.get("start")).toEqual({ x: 0, y: 0, ...CARD_SIZE });
  });
});
