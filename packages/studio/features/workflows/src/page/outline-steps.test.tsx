// @vitest-environment jsdom

import { selectStepsStep } from "@halonicjs/studio-feature-agents/api";
import { RunsListService, RunsSourceService } from "@halonicjs/studio-feature-runs/api";
import { limitedLookup } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, expect, it } from "vitest";
import { WorkflowsHostService, type WorkflowView } from "../api.ts";
import { workflowsFeature } from "../feature.ts";
import { memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { settings } from "./page-fixtures.ts";
import { WorkflowPage, WorkflowScreen } from "./workflow-page.tsx";

afterEach(() => unmount());

/** Support reply, which runs Sorter in `triage` and `draft`. */
const sorted: WorkflowView = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  initial: "triage",
  steps: [
    { id: "triage", type: "task", agent: "sorter", title: "Read the email" },
    { id: "draft", type: "task", agent: "sorter" },
    { id: "done", type: "final" },
  ],
  arrows: [
    { from: "triage", to: "draft" },
    { from: "draft", to: "done" },
  ],
  layout: {},
  agents: [{ id: "sorter", name: "Sorter" }],
};

/** The canvas's step cards that wear the outline, by step id. */
const outlined = (page: HTMLElement) =>
  [...page.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")]
    .filter((card) => card.className.includes("border-dashed"))
    .map((card) => sorted.steps.find((step) => card.textContent?.includes(name(step)))?.id);

/** A step's name as its card shows it. */
const name = (step: { id: string; title?: string | undefined }) => step.title ?? step.id;

const card = (page: HTMLElement, stepId: string) =>
  [...page.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find((one) => {
    const step = sorted.steps.find((it) => it.id === stepId);
    return step !== undefined && one.textContent?.includes(name(step));
  });

/** The line over the canvas that says why steps are outlined. */
const outlineLine = (page: HTMLElement) =>
  [...page.querySelectorAll("p")].find((one) => one.textContent?.includes(" use"))?.textContent;

const selectedTab = (page: HTMLElement) =>
  page.querySelector("[role=tab][aria-selected=true]")?.textContent;

verifies("workflows.page.outline-steps", () => {
  it("opens on Flow with the agent's steps outlined, no card, and says so once", async () => {
    const { host } = memoryHost([], [], [sorted], [settings]);
    const said: string[] = [];
    const services = new Map<unknown, unknown>([
      [WorkflowsHostService, host],
      [RunsSourceService, memoryRuns().source],
      [RunsListService, {}],
    ]);
    const context = {
      services: limitedLookup(workflowsFeature, { get: (key) => services.get(key) }),
      announcer: { announce: (line: string) => said.push(line), announceState: () => undefined },
    };
    const page = await show(
      <WorkflowPage
        item={{ kind: "workflow", hub: "acme", id: "reply" }}
        context={context as never}
        Sections={() => null}
        step={selectStepsStep(["triage", "draft"])}
        asked={1}
      />,
    );

    expect(selectedTab(page)?.startsWith("Flow")).toBe(true);
    expect(outlined(page)).toEqual(["triage", "draft"]);
    expect(page.querySelector("[aria-pressed=true]")).toBeNull();
    expect(page.textContent).not.toContain("Support reply › triage");
    expect(said).toEqual(["2 steps use Sorter: Read the email, draft"]);
    expect(outlineLine(page)).toBe(
      "2 steps use Sorter: Read the email, draftPick a step or an empty spot to clear.",
    );
  });

  it("says one step in the singular", async () => {
    const { host } = memoryHost([], [], [sorted], [settings]);
    const said: string[] = [];
    await show(
      <WorkflowScreen
        host={host}
        runs={memoryRuns().source}
        hubId="acme"
        id="reply"
        outline={["triage"]}
        announce={(line) => said.push(line)}
      />,
    );
    expect(said).toEqual(["1 step uses Sorter: Read the email"]);
  });

  it("goes back to Flow and outlines again when an open page is asked", async () => {
    const { host } = memoryHost([], [], [sorted], [settings]);
    const said: string[] = [];
    let ask: () => void = () => undefined;
    function Asked() {
      const [asked, setAsked] = useState<number | undefined>();
      ask = () => setAsked((count) => (count ?? 0) + 1);
      return (
        <WorkflowScreen
          host={host}
          runs={memoryRuns().source}
          hubId="acme"
          id="reply"
          {...(asked !== undefined && { outline: ["triage"], outlineAsked: asked })}
          announce={(line) => said.push(line)}
        />
      );
    }
    const page = await show(<Asked />);
    expect(outlined(page)).toEqual([]);
    const configuration = [...page.querySelectorAll<HTMLElement>("[role=tab]")].find((one) =>
      one.textContent?.startsWith("Configuration"),
    );
    await act(async () => configuration?.click());

    await act(async () => ask());

    expect(selectedTab(page)?.startsWith("Flow")).toBe(true);
    expect(outlined(page)).toEqual(["triage"]);
    expect(said).toEqual(["1 step uses Sorter: Read the email"]);
  });

  it("drops the outline when a step is picked", async () => {
    const { host } = memoryHost([], [], [sorted], [settings]);
    const page = await show(
      <WorkflowScreen
        host={host}
        runs={memoryRuns().source}
        hubId="acme"
        id="reply"
        outline={["triage", "draft"]}
      />,
    );

    await act(async () => card(page, "draft")?.click());

    expect(outlined(page)).toEqual([]);
    expect(outlineLine(page)).toBeUndefined();
    expect(card(page, "draft")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("outlines no step and says nothing for steps that aren't in the file", async () => {
    const { host } = memoryHost([], [], [sorted], [settings]);
    const said: string[] = [];
    const page = await show(
      <WorkflowScreen
        host={host}
        runs={memoryRuns().source}
        hubId="acme"
        id="reply"
        outline={["gone"]}
        announce={(line) => said.push(line)}
      />,
    );
    expect(outlined(page)).toEqual([]);
    expect(outlineLine(page)).toBeUndefined();
    expect(said).toEqual([]);
  });
});
