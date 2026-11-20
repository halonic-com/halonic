import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { WorkflowArrow, WorkflowView } from "../api.ts";
import { boxesFor } from "../canvas/auto-layout.ts";
import type { Point } from "../canvas/geometry.ts";
import { reply } from "./page-fixtures.ts";
import { waysOnFrom } from "./ways-on.ts";

/** The support reply's steps, with the arrows a test gives them and any cards the person placed. */
const withArrows = (
  arrows: readonly WorkflowArrow[],
  layout: Readonly<Record<string, Point>> = {},
): WorkflowView => ({
  ...reply,
  initial: "read",
  steps: [
    { id: "read", type: "task", title: "Read the email" },
    { id: "classify", type: "task", title: "Classify it" },
    { id: "draft", type: "task", title: "Draft a reply" },
    {
      id: "spam",
      type: "final",
      title: "Finished without a reply, because nobody needs to answer spam",
    },
    { id: "approved", type: "final", title: "Finished with the reply approved" },
    { id: "rejected", type: "final" },
  ],
  arrows,
  layout,
});

/** What `stepId`'s card says about where it leads, with its cards where the canvas draws them. */
const waysOn = (stepId: string, flow: WorkflowView) =>
  waysOnFrom(
    stepId,
    flow,
    boxesFor(
      flow.steps.map((step) => step.id),
      flow.arrows,
      flow.initial,
      flow.layout,
    ),
  );

verifies("workflows.page.step-cards", () => {
  it("says the one step a card leads on to", () => {
    const flow = withArrows([{ from: "read", to: "classify" }]);
    expect(waysOn("read", flow)).toBe("Next: Classify it.");
  });

  it("lists every way on without words in one sentence, left to right as their cards are drawn", () => {
    // The Acme file lists the arrow to spam first, but the canvas draws Draft a reply on the left.
    const flow = withArrows([
      { from: "read", to: "classify" },
      { from: "classify", to: "spam" },
      { from: "classify", to: "draft" },
    ]);
    expect(waysOn("classify", flow)).toBe(
      "Next: Draft a reply, or Finished without a reply, because nobody needs to answer spam.",
    );
  });

  it("follows a card the person moved, then reads top to bottom where cards line up", () => {
    const moved = withArrows(
      [
        { from: "classify", to: "draft" },
        { from: "classify", to: "spam" },
      ],
      { spam: { x: -300, y: 400 } },
    );
    expect(waysOn("classify", moved)).toBe(
      "Next: Finished without a reply, because nobody needs to answer spam, or Draft a reply.",
    );

    const stacked = withArrows(
      [
        { from: "classify", to: "spam" },
        { from: "classify", to: "draft" },
      ],
      { draft: { x: 0, y: 200 }, spam: { x: 0, y: 400 } },
    );
    expect(waysOn("classify", stacked)).toBe(
      "Next: Draft a reply, or Finished without a reply, because nobody needs to answer spam.",
    );
  });

  it("gives each way with words its own sentence, a step without a title by its id", () => {
    const flow = withArrows([
      { from: "draft", to: "approved", label: "Approve" },
      { from: "draft", to: "rejected", label: "Reject" },
    ]);
    expect(waysOn("draft", flow)).toBe(
      "Approve: Finished with the reply approved. Reject: rejected.",
    );
  });

  it("says Next for a way without words among ways with words", () => {
    const flow = withArrows([
      { from: "draft", to: "approved", label: "Approve" },
      { from: "draft", to: "rejected" },
    ]);
    expect(waysOn("draft", flow)).toBe(
      "Approve: Finished with the reply approved. Next: rejected.",
    );
  });

  it("says nothing for a step that leads nowhere, or only to a step that isn't there", () => {
    const flow = withArrows([{ from: "classify", to: "gone" }]);
    expect(waysOn("approved", flow)).toBeUndefined();
    expect(waysOn("classify", flow)).toBeUndefined();
  });
});
