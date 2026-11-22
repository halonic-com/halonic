// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { WorkflowConfiguration, WorkflowProblem, WorkflowView } from "../api.ts";
import { choose, field, memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { reply, settings } from "./page-fixtures.ts";
import { WorkflowScreen } from "./workflow-page.tsx";

afterEach(unmount);

/** Iris's Weekly report (C575): its `write` step names `reportr`, a typo for the hub's `reporter`. */
const report = {
  ...reply,
  initial: "write",
  steps: [
    { id: "write", type: "task", title: "Write the report", agent: "reportr" },
    { id: "done", type: "final" },
  ],
  arrows: [{ from: "write", to: "done" }],
  agents: [{ id: "reporter", name: "Reporter" }],
} satisfies WorkflowView;

const typo: WorkflowProblem = {
  severity: "error",
  code: "unknown-agent",
  message: '"write" uses unknown agent "reportr". Did you mean "reporter"?',
  stepId: "write",
};

/** The message as Configuration › Problems says it: the step by its title. */
const typoSentence = '"Write the report" uses unknown agent "reportr". Did you mean "reporter"?';

/** The page for `report`, with these problems found in it, on a host that can change steps. */
async function open(problems: readonly WorkflowProblem[]) {
  const configuration: WorkflowConfiguration = {
    ...settings,
    initial: "write",
    stepIds: ["write", "done"],
    problems,
  };
  const { host } = memoryHost([], [], [report], [configuration], {
    changeStep: async () => {},
  });
  return show(<WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />);
}

/** A step's card on the canvas, by the title it shows. */
const card = (page: HTMLElement, title: string) =>
  [...page.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find((one) =>
    one.textContent?.includes(title),
  );

async function pick(page: HTMLElement, title: string) {
  await act(async () => card(page, title)?.click());
}

/** The docked card's Callout: the first block under the breadcrumb, when it has the tone's fill. */
const callout = (page: HTMLElement) =>
  page.querySelector<HTMLElement>("aside [class*='-soft']") ?? null;

/** The text of each element an attribute's ids point at, in order. */
const textOf = (element: Element | null | undefined, attribute: string) =>
  (element?.getAttribute(attribute) ?? "")
    .split(" ")
    .filter((id) => id !== "")
    .map((id) => document.getElementById(id)?.textContent ?? "");

verifies("workflows.page.docked-card-problems", () => {
  it("says what's wrong at the top of the step's card and marks its Agent field", async () => {
    const page = await open([typo]);
    await pick(page, "Write the report");

    const box = callout(page);
    expect(box?.className).toContain("bg-danger-soft");
    expect(box?.textContent).toBe(`Error: ${typoSentence}`);
    expect(box?.previousElementSibling?.textContent).toBe("Support reply › write");

    const agent = field(page, "Agent");
    expect(agent?.getAttribute("aria-invalid")).toBe("true");
    expect(textOf(agent, "aria-describedby")).toEqual([
      "Pick one of this hub's agents.",
      typoSentence,
    ]);
  });

  it("takes the mark away once another agent is picked", async () => {
    const page = await open([typo]);
    await pick(page, "Write the report");
    const agent = field(page, "Agent") as HTMLSelectElement;

    await choose(agent, "reporter");

    expect(agent.hasAttribute("aria-invalid")).toBe(false);
    expect(textOf(agent, "aria-describedby")).toEqual([]);
  });

  it("lists several problems in attention, each after its glyph, in the Problems tab's words", async () => {
    const page = await open([
      { severity: "warning", code: "unreachable", message: "x", stepId: "write" },
      {
        severity: "warning",
        code: "ignored-key",
        message: '"write" has a key it ignores',
        stepId: "write",
      },
    ]);
    await pick(page, "Write the report");

    const box = callout(page);
    expect(box?.className).toContain("bg-attention-soft");
    expect([...(box?.querySelectorAll("li") ?? [])].map((row) => row.textContent)).toEqual([
      "△ Warning: Can't be reached: no arrow leads to it.",
      '△ Warning: "Write the report" has a key it ignores',
    ]);
    expect(field(page, "Agent")?.hasAttribute("aria-invalid")).toBe(false);
  });

  it("shows no Callout on the card of a step without problems", async () => {
    const page = await open([typo]);
    await pick(page, "done");

    expect(page.querySelector("aside h2")?.textContent).toBe("done");
    expect(callout(page)).toBeNull();
  });

  it("gives the canvas card's full messages as its description, before where it leads", async () => {
    const page = await open([typo]);

    const described = textOf(card(page, "Write the report"), "aria-describedby");
    expect(described[0]).toBe(typoSentence);
    expect(described).toHaveLength(2);
    expect(textOf(card(page, "done"), "aria-describedby")).toEqual([]);
  });
});
