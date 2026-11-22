// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import type { WorkflowProblem } from "../api.ts";
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
    expect(taken).toContain("text-accent-text");
    expect(taken).toContain("forced-colors:text-[Highlight]");
    expect(notTaken).toBe("text-fg-muted");
    expect(waiting).toBe("text-fg-muted");
  });
});

/** `review` waits for an answer: its "approved" arrow comes after an unguarded one on the same event. */
const reviewBoxes = new Map([
  ["review", { x: 0, y: 0, ...CARD_SIZE }],
  ["ship", { x: 0, y: 136, ...CARD_SIZE }],
]);
const reviewArrows = [
  { from: "review", to: "ship", label: "answered", event: "answer" },
  { from: "review", to: "ship", label: "approved", event: "answer" },
  { from: "review", to: "nowhere" },
];
const neverFires: WorkflowProblem = {
  severity: "warning",
  code: "unguarded-shadow",
  message:
    'In "review", the transition to "ship" can never fire: an earlier one on "answer" has no condition',
  stepId: "review",
  arrowIndex: 1,
};
const missingStep: WorkflowProblem = {
  severity: "error",
  code: "unknown-target",
  message: '"review" goes to unknown state "nowhere"',
  stepId: "review",
  arrowIndex: 2,
};
const stepName = (stepId: string) => (stepId === "review" ? "Check the reply" : stepId);

/** Each arrow's plate, in the order the arrows are drawn. */
const plates = (page: Element) => [...page.querySelectorAll<SVGGElement>("svg g[data-plate]")];

verifies("workflows.page.step-problems", () => {
  it("marks the plate of the arrow that never fires, after its words, and names the step in its tooltip", async () => {
    const page = await show(
      <Arrows
        arrows={reviewArrows}
        boxes={reviewBoxes}
        problems={[neverFires]}
        stepName={stepName}
      />,
    );
    const [answered, approved] = plates(page);

    expect(approved?.querySelector("text")?.textContent).toBe("approved · △ Never taken");
    expect(approved?.querySelector("title")?.textContent).toBe(
      'In "Check the reply", the transition to "ship" can never fire: an earlier one on "answer" has no condition',
    );
    expect(approved?.getAttribute("class")).toBe("pointer-events-auto");
    expect(approved?.querySelector("rect:last-of-type")?.getAttribute("class")).toContain(
      "stroke-attention",
    );
    expect(approved?.querySelector("tspan")?.getAttribute("class")).toBe("fill-attention");
    expect(answered?.textContent).toBe("answered");
    expect(answered?.querySelector("title")).toBeNull();
  });

  it("draws an arrow to a missing step as a dashed danger arrow out of its card, ending at its plate", async () => {
    const page = await show(
      <Arrows arrows={reviewArrows} boxes={reviewBoxes} problems={[missingStep]} />,
    );
    const stray = [...page.querySelectorAll("svg g[class]")].find(
      (group) => group.querySelector("path[stroke-dasharray]") !== null,
    );
    const plate = stray?.querySelector("g[data-plate]");

    expect(stray?.getAttribute("class")).toBe("text-danger");
    expect(stray?.querySelector("path")?.getAttribute("d")).toBe(
      `M ${CARD_SIZE.width} ${CARD_SIZE.height / 2} L ${CARD_SIZE.width + 32} ${CARD_SIZE.height / 2}`,
    );
    expect(plate?.querySelector("text")?.textContent).toBe("✕ Goes to a missing step");
    expect(plate?.querySelector("title")?.textContent).toBe(
      '"review" goes to unknown state "nowhere"',
    );
  });

  it("lands each next stray arrow of a step one plate lower", async () => {
    const page = await show(
      <Arrows
        arrows={[...reviewArrows, { from: "review", to: "gone" }]}
        boxes={reviewBoxes}
        problems={[missingStep, { ...missingStep, arrowIndex: 3 }]}
      />,
    );
    const ends = [...page.querySelectorAll("svg path[stroke-dasharray]")].map(
      (path) => path.getAttribute("d")?.split(" L ")[1],
    );

    expect(ends).toEqual([
      `${CARD_SIZE.width + 32} ${CARD_SIZE.height / 2}`,
      `${CARD_SIZE.width + 32} ${CARD_SIZE.height / 2 + 22}`,
    ]);
  });

  it("leaves out an arrow to a missing step while no problem says why", async () => {
    const page = await show(<Arrows arrows={reviewArrows} boxes={reviewBoxes} />);

    expect(page.querySelectorAll("svg path")).toHaveLength(2);
    expect(page.querySelector("svg path[stroke-dasharray]")).toBeNull();
  });

  it("leaves the plates plain when the step's problem isn't about an arrow", async () => {
    const page = await show(
      <Arrows
        arrows={reviewArrows}
        boxes={reviewBoxes}
        problems={[{ ...neverFires, code: "dead-end" }]}
      />,
    );

    expect(plates(page).map((plate) => plate.textContent)).toEqual(["answered", "approved"]);
  });
});
