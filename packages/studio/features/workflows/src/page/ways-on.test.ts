import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { WorkflowArrow, WorkflowView } from "../api.ts";
import { reply } from "./page-fixtures.ts";
import { waysOnFrom } from "./ways-on.ts";

/** The support reply's steps, with the arrows a test gives them. */
const withArrows = (arrows: readonly WorkflowArrow[]): WorkflowView => ({
  ...reply,
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
});

verifies("workflows.page.step-cards", () => {
  it("says the one step a card leads on to", () => {
    const flow = withArrows([{ from: "read", to: "classify" }]);
    expect(waysOnFrom("read", flow)).toBe("Next: Classify it.");
  });

  it("lists every way on without words in one sentence, in the order they're drawn", () => {
    const flow = withArrows([
      { from: "classify", to: "draft" },
      { from: "classify", to: "spam" },
    ]);
    expect(waysOnFrom("classify", flow)).toBe(
      "Next: Draft a reply, or Finished without a reply, because nobody needs to answer spam.",
    );
  });

  it("gives each way with words its own sentence, a step without a title by its id", () => {
    const flow = withArrows([
      { from: "draft", to: "approved", label: "Approve" },
      { from: "draft", to: "rejected", label: "Reject" },
    ]);
    expect(waysOnFrom("draft", flow)).toBe(
      "Approve: Finished with the reply approved. Reject: rejected.",
    );
  });

  it("says Next for a way without words among ways with words", () => {
    const flow = withArrows([
      { from: "draft", to: "approved", label: "Approve" },
      { from: "draft", to: "classify" },
    ]);
    expect(waysOnFrom("draft", flow)).toBe(
      "Approve: Finished with the reply approved. Next: Classify it.",
    );
  });

  it("says nothing for a step that leads nowhere, or only to a step that isn't there", () => {
    const flow = withArrows([{ from: "classify", to: "gone" }]);
    expect(waysOnFrom("approved", flow)).toBeUndefined();
    expect(waysOnFrom("classify", flow)).toBeUndefined();
  });
});
