// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import type { WorkflowView } from "../api.ts";
import { memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { reply } from "./page-fixtures.ts";
import { WorkflowScreen } from "./workflow-page.tsx";

afterEach(() => unmount());

verifies("workflows.page.step-cards", () => {
  it("tells a screen reader where each card leads, with the words on its arrows (a11y check E1)", async () => {
    const triage = {
      ...reply,
      initial: "classify",
      steps: [
        { id: "classify", type: "task", title: "Classify it", agent: "sorter" },
        { id: "ask", type: "wait", title: "Approve this reply?" },
        { id: "sent", type: "final", title: "Finished with the reply approved" },
        { id: "dropped", type: "final" },
      ],
      arrows: [
        { from: "classify", to: "ask" },
        { from: "classify", to: "dropped" },
        { from: "ask", to: "sent", label: "Approve" },
        { from: "ask", to: "dropped", label: "Reject" },
      ],
    } satisfies WorkflowView;
    const { host } = memoryHost([], [], [triage]);
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );
    const described = [...page.querySelectorAll("button[aria-pressed]")].map((card) => {
      const ids = card.getAttribute("aria-describedby");
      return ids === null ? undefined : document.getElementById(ids)?.textContent;
    });

    expect(described).toEqual([
      "Next: Approve this reply?, or dropped.",
      "Approve: Finished with the reply approved. Reject: dropped.",
      undefined,
      undefined,
    ]);
  });

  it("names a card title first, then its kind, the Start chip and its agent (a11y check E3)", async () => {
    const titled = {
      ...reply,
      steps: [{ id: "start", type: "task", title: "Read the email", agent: "writer" }],
      arrows: [],
    } satisfies WorkflowView;
    const { host } = memoryHost([], [], [titled]);
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );
    const card = page.querySelector("button[aria-pressed]");
    const name = (card?.getAttribute("aria-labelledby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);

    expect(name).toEqual(["Read the email", "AGENT STEP", "Start", "writer"]);
    expect(card?.textContent).toBe("AGENT STEPStartRead the emailwriter");
  });

  it("makes the canvas a named group, not an application (a11y check E3)", async () => {
    const { host } = memoryHost([], [], [reply]);
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );

    expect(page.querySelector("[role=application]")).toBeNull();
    expect(page.querySelector("[role=group][aria-label='Workflow canvas']")).not.toBeNull();
  });
});
