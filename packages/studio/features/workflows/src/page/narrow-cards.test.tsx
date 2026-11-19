// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { WorkflowView } from "../api.ts";
import {
  buttonNamed,
  memoryHost,
  memoryRuns,
  runSummary,
  show,
  unmount,
} from "../test-support.tsx";
import { WorkflowScreen } from "./workflow-page.tsx";

afterEach(unmount);

const reply: WorkflowView = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  initial: "read",
  steps: [
    { id: "read", type: "task" },
    { id: "done", type: "final" },
  ],
  arrows: [{ from: "read", to: "done" }],
  layout: {},
};

async function openPage() {
  const runs = memoryRuns();
  const { host } = memoryHost([], [], [reply], [], {
    startRun: async () => ({ runId: "run_mfx3k2a1_01jd8q" }),
  });
  const page = await show(
    <WorkflowScreen host={host} runs={runs.source} hubId="acme" id="reply" />,
  );
  return { page, runs };
}

const press = (button: HTMLElement | null | undefined) =>
  act(async () => {
    button?.click();
  });

const runButton = (page: HTMLElement) =>
  [...page.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Run");

const classesOf = (element: Element | null | undefined) => element?.className.split(" ") ?? [];

/** A card's header: the row that holds its Close button. */
const headerOf = (page: HTMLElement, close: string) =>
  page.querySelector(`aside button[aria-label='${close}']`)?.parentElement;

// jsdom lays nothing out, so these check the classes that let a line wrap in a 195 px window.
verifies("workflows.page.narrow-cards", () => {
  it("wraps the run card's header with Close run at its top end and the chip able to go under the id", async () => {
    const { page, runs } = await openPage();
    await press(runButton(page));
    await press(buttonNamed(page, "Start run"));
    await act(async () => runs.change([runSummary({ status: "running", state: "read" })]));

    const header = headerOf(page, "Close run");
    expect(classesOf(header)).toEqual(expect.arrayContaining(["flex", "items-start"]));
    const idAndChip = header?.firstElementChild;
    expect(classesOf(idAndChip)).toEqual(
      expect.arrayContaining(["flex-wrap", "min-w-0", "flex-1"]),
    );
    expect(idAndChip?.querySelector("h2")?.textContent).toBe("01jd8q");
    expect(idAndChip?.textContent).toContain("Running");
    expect(classesOf(idAndChip?.querySelector("h2"))).toContain("wrap-anywhere");
  });

  it("lets the start card's title wrap, so Close stays inside the window", async () => {
    const { page } = await openPage();
    await press(runButton(page));

    const title = headerOf(page, "Close")?.firstElementChild;
    expect(classesOf(title)).toContain("min-w-0");
    expect(classesOf(title?.querySelector("h2"))).toContain("wrap-anywhere");
  });

  it("wraps a Runs row's summary and time onto a line under the chip and id, and never cuts the summary to nothing", async () => {
    const { page, runs } = await openPage();
    await act(async () => runs.change([runSummary({ status: "running", state: "read" })]));
    await press(page.querySelector<HTMLElement>("[role='tab']:last-of-type"));

    const row = page.querySelector("li button");
    expect(classesOf(row)).toContain("flex-wrap");
    const [chipAndId, summaryAndTime] = [...(row?.children ?? [])];
    expect(chipAndId?.textContent).toContain("01jd8q");
    expect(classesOf(summaryAndTime)).toEqual(expect.arrayContaining(["min-w-0", "flex-1"]));
    expect(classesOf(summaryAndTime?.firstElementChild)).toEqual(
      expect.arrayContaining(["truncate", "min-w-24"]),
    );
  });
});
