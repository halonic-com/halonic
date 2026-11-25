// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { WorkflowView } from "../api.ts";
import { field, memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { WorkflowScreen } from "./workflow-page.tsx";

afterEach(() => unmount());

/** A rule step that decides, then a tool step that acts on its decisions. */
const watcher: WorkflowView = {
  hubId: "acme",
  id: "watch",
  name: "Watch the pull requests",
  initial: "match",
  steps: [
    { id: "match", type: "rule", output: "decisions" },
    { id: "merge", type: "tool", output: "merged" },
    { id: "done", type: "final" },
  ],
  arrows: [
    { from: "match", to: "merge" },
    { from: "merge", to: "done" },
  ],
  layout: {},
  agents: [],
};

async function showWatcher(): Promise<HTMLElement> {
  const { host } = memoryHost([], [], [watcher], [], { changeStep: async () => {} });
  return show(<WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="watch" />);
}

/** The step's card on the canvas. */
const canvasCard = (page: HTMLElement, stepId: string) =>
  [...page.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
    (card) => card.querySelector("[title]")?.textContent === stepId,
  ) as HTMLButtonElement;

async function pick(page: HTMLElement, stepId: string): Promise<void> {
  await act(async () => canvasCard(page, stepId).click());
}

const kinds = (page: HTMLElement) =>
  [...(field(page, "Type") as HTMLSelectElement).options].map((option) => option.text);

const sixKinds = ["Agent step", "Wait", "End", "Workflow", "Parallel", "For each"];

verifies("workflows.page.tool-step", () => {
  it("shows a tool step's kind on its cards, and its output", async () => {
    const page = await showWatcher();
    expect(canvasCard(page, "merge").textContent).toContain("TOOL STEP");

    await pick(page, "merge");
    expect(kinds(page)).toEqual([...sixKinds, "Tool"]);
    expect(field(page, "Type")?.value).toBe("tool");
    expect(field(page, "Save output as")?.value).toBe("merged");
    expect(field(page, "Description")).toBeDefined();
  });

  it("lists Rule, not Tool, for a rule step", async () => {
    const page = await showWatcher();
    await pick(page, "match");
    expect(kinds(page)).toEqual([...sixKinds, "Rule"]);
  });
});
