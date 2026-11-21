// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { WorkflowConfiguration, WorkflowProblem, WorkflowView } from "../api.ts";
import { memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { reply, settings } from "./page-fixtures.ts";
import { WorkflowScreen } from "./workflow-page.tsx";

afterEach(unmount);

/** Iris's broken workflow (C544-3): its first step, titled, names an agent that isn't there. */
const broken = {
  ...reply,
  initial: "first",
  steps: [
    { id: "first", type: "task", title: "Ask a missing agent", agent: "nobody-here" },
    { id: "done", type: "final" },
  ],
  arrows: [{ from: "first", to: "done" }],
} satisfies WorkflowView;

const unknownAgent: WorkflowProblem = {
  severity: "error",
  code: "unknown-agent",
  message: '"first" uses unknown agent "nobody-here"',
  stepId: "first",
};

/** The page for `broken`, with these problems found in it. */
async function open(problems: readonly WorkflowProblem[]) {
  const configuration: WorkflowConfiguration = {
    ...settings,
    initial: "first",
    stepIds: ["first", "done"],
    problems,
  };
  const { host } = memoryHost([], [], [broken], [configuration]);
  return show(<WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />);
}

/** A step's card on the canvas, by the title it shows. */
const card = (page: HTMLElement, title: string) =>
  [...page.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find((one) =>
    one.textContent?.includes(title),
  );

/** A card's problem line, which carries its full messages as its tooltip. */
const lineOf = (button: HTMLElement | undefined) =>
  button?.querySelector<HTMLElement>("[id$='-problems']") ?? null;

/** What a screen reader names a card: the text of each part it is labelled by. */
const nameOf = (button: HTMLElement | undefined) =>
  (button?.getAttribute("aria-labelledby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent)
    .join(" ");

verifies("workflows.page.step-problems", () => {
  it("marks the step with the error: a danger border, its line and its full message by name", async () => {
    const page = await open([unknownAgent]);
    const first = card(page, "Ask a missing agent");
    const line = lineOf(first);

    expect(first?.className).toContain("border-danger");
    expect(line?.textContent).toBe("✕ Error: Uses a missing agent");
    expect(line?.title).toBe('"Ask a missing agent" uses unknown agent "nobody-here"');
    expect(nameOf(first)).toBe(
      "Ask a missing agent AGENT STEP Start nobody-here ✕ Error: Uses a missing agent",
    );
    expect(card(page, "done")?.className).toContain("border-border");
  });

  it("draws warnings alone in attention, and several problems as a count", async () => {
    const page = await open([
      { severity: "warning", code: "unreachable", message: "x", stepId: "first" },
      { severity: "warning", code: "ignored-key", message: "y", stepId: "first" },
    ]);
    const first = card(page, "Ask a missing agent");

    expect(first?.className).toContain("border-attention");
    expect(lineOf(first)?.textContent).toBe("△ Warning: 2 warnings");
  });

  it("keeps the line under the selection's ring when the step is picked", async () => {
    const page = await open([unknownAgent]);
    await act(async () => card(page, "Ask a missing agent")?.click());
    const first = card(page, "Ask a missing agent");

    expect(first?.className).toContain("ring-accent");
    expect(first?.className).not.toContain("border-danger");
    expect(lineOf(first)?.textContent).toContain("Uses a missing agent");
  });

  it("leaves a card whose only problem is an arrow's unmarked", async () => {
    const page = await open([{ ...unknownAgent, code: "unknown-target" }]);
    const first = card(page, "Ask a missing agent");

    expect(first?.className).toContain("border-border");
    expect(lineOf(first)).toBeNull();
  });
});

verifies("workflows.configuration.problem-lines", () => {
  it("names the step on Configuration › Problems as its card does (C544-3)", async () => {
    const page = await open([unknownAgent]);
    const configuration = [...page.querySelectorAll<HTMLElement>("[role=tab]")].find(
      (tab) => tab.textContent?.startsWith("Configuration") === true,
    );
    await act(async () => configuration?.click());
    const problems = [...page.querySelectorAll<HTMLElement>("[role=tab]")].find(
      (tab) => tab.textContent?.startsWith("Problems") === true,
    );
    await act(async () => problems?.click());

    const row = page.querySelector("li");
    expect(row?.textContent).toContain('"Ask a missing agent" uses unknown agent "nobody-here"');
    const link = row?.querySelector("button");
    expect(link?.textContent).toBe("Ask a missing agent");
    expect(link?.getAttribute("aria-label")).toBe("Open Ask a missing agent");
  });
});
