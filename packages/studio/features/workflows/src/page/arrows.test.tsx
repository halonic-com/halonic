// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { CARD_SIZE } from "../canvas/geometry.ts";
import { show, unmount } from "../test-support.tsx";
import { Arrows } from "./arrows.tsx";

afterEach(unmount);

const boxes = new Map([
  ["start", { x: 0, y: 0, ...CARD_SIZE }],
  ["done", { x: 0, y: 136, ...CARD_SIZE }],
  ["fix", { x: 240, y: 136, ...CARD_SIZE }],
]);
const arrows = [
  { from: "start", to: "done", label: "approved" },
  { from: "start", to: "fix", label: "rejected" },
  { from: "done", to: "done" },
];

const colours = (page: Element) =>
  [...page.querySelectorAll("svg g[class]")]
    .filter((group) => group.querySelector("path") !== null)
    .map((group) => group.getAttribute("class"));

verifies("workflows.canvas.arrows", () => {
  it("draws every arrow neutral when no run is shown", async () => {
    const page = await show(<Arrows arrows={arrows} boxes={boxes} />);
    expect(colours(page)).toEqual(["text-fg-muted", "text-fg-muted", "text-fg-muted"]);
  });

  it("draws only the branch the run took blue", async () => {
    const page = await show(<Arrows arrows={arrows} boxes={boxes} route={["start", "done"]} />);
    const [taken, notTaken, waiting] = colours(page);
    expect(taken).toContain("text-accent");
    expect(taken).toContain("forced-colors:text-[Highlight]");
    expect(notTaken).toBe("text-fg-muted");
    expect(waiting).toBe("text-fg-muted");
  });
});
