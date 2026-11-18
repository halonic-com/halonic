// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { show, unmount } from "../test-support.tsx";
import { reply } from "./page-fixtures.ts";
import { CARD_BORDER, DOT, dotCentre, StepCard } from "./step-card.tsx";
import { WorkflowCanvas } from "./workflow-canvas.tsx";

afterEach(unmount);

const dots = (page: Element) =>
  [...page.querySelectorAll("[data-testid=status-dot]")].map((dot) => [
    dot.closest("button")?.textContent?.includes("writer") ? "write" : "other",
    dot.getAttribute("data-mark"),
  ]);

verifies("workflows.canvas.status-dots", () => {
  it("draws no dot and no light when no run is shown", async () => {
    const page = await show(<WorkflowCanvas workflow={reply} />);
    expect(dots(page)).toEqual([]);
    expect(page.querySelector("[data-testid=point-of-light]")).toBeNull();
  });

  it("draws a dot on each step the run reached and the light on the active one", async () => {
    const page = await show(
      <WorkflowCanvas
        workflow={reply}
        marks={{ start: "done", write: "running" }}
        active="write"
      />,
    );
    expect(dots(page)).toEqual([
      ["other", "done"],
      ["write", "running"],
    ]);
    expect(page.querySelectorAll("[data-testid=point-of-light]")).toHaveLength(1);
    expect(page.querySelector("[data-mark=running]")?.textContent).toBe("Running");
  });

  it("draws the light nowhere once the run has ended", async () => {
    const page = await show(
      <WorkflowCanvas workflow={reply} marks={{ start: "done", write: "failed" }} />,
    );
    expect(page.querySelector("[data-testid=point-of-light]")).toBeNull();
  });

  it("places the dot where the light aims: its centre is dotCentre", async () => {
    const box = { x: 40, y: 30, width: 200, height: 72 };
    const step = reply.steps[0];
    if (step === undefined) throw new Error("fixture has no step");
    const page = await show(
      <StepCard step={step} box={box} first={false} selected={false} mark="waiting" />,
    );
    const dot = page.querySelector<HTMLElement>("[data-testid=status-dot]");
    const centre = dotCentre(box);
    expect(Number.parseFloat(dot?.style.left ?? "") + CARD_BORDER + DOT / 2).toBe(centre.x - box.x);
    expect(Number.parseFloat(dot?.style.top ?? "") + CARD_BORDER + DOT / 2).toBe(centre.y - box.y);
  });
});
