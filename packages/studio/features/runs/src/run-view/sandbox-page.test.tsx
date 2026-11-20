// @vitest-environment jsdom
import type { RunEventBody, SandboxOpenedView } from "@halonicjs/events";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { entered, logOf } from "./run-log.test-helper.ts";
import { RunView } from "./run-page.tsx";

afterEach(unmountAll);

const runId = "run_a_7k2m9p";
const view: SandboxOpenedView = {
  strength: "os",
  workingFolder: "~/work/acme",
  readOnlyPaths: [],
  deniedGroups: ["ssh-keys"],
  deniedPaths: [],
  allowedSites: ["github.com"],
  timeLimitMs: 1_800_000,
};

async function openRun(body: [number, RunEventBody][], ended: boolean, phone = false) {
  const events = logOf(runId, body);
  const summary = ended
    ? summaryWith({
        id: runId,
        status: "completed",
        endedAt: new Date(mondayMorning.getTime() + 60_000).toISOString(),
        lastSeq: events.length,
        state: null,
        statesVisited: ["draft"],
      })
    : summaryWith({ id: runId, lastSeq: events.length });
  const list = new RunsList(fakeSource([summary], { [runId]: events }).source);
  const page = <RunView list={list} runId={runId} now={() => mondayMorning} />;
  const root = render(
    phone ? <PresentationProvider presentation="phone">{page}</PresentationProvider> : page,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

const opened = (sandbox: unknown): RunEventBody =>
  ({ type: "sandbox.opened", state: "draft", agent: "writer", sandbox }) as RunEventBody;

function rowStarting(root: HTMLElement, text: string): Element | undefined {
  return [...root.querySelectorAll('[role="grid"] tbody tr')].find((row) =>
    row.textContent?.includes(text),
  );
}

verifies("runs.run-view.sandbox-panel", () => {
  it("draws the line under a sandboxed step, and its row opens the step's list", async () => {
    const root = await openRun(
      [
        [0, entered("draft")],
        [0, opened(view)],
      ],
      true,
    );
    const line = rowStarting(root, "In a sandbox");
    expect(line?.textContent).toContain(
      "In a sandbox · writes only in its working folder and its own temp and settings folders · reaches Halonic and 1 site · What it can do",
    );
    // A screen reader hears the link named by its step.
    expect(line?.textContent).toContain("What Draft can do");
    expect(line?.querySelector("svg")).not.toBeNull();

    act(() => line?.querySelector<HTMLElement>('[role="gridcell"]')?.click());
    const panel = root.querySelector("aside");
    expect(panel?.textContent).toContain("What this step could do");
    expect(panel?.textContent).toContain("Your SSH keys");
  });

  it("says can while the run is live", async () => {
    const root = await openRun(
      [
        [0, entered("draft")],
        [0, opened(view)],
      ],
      false,
    );
    act(() =>
      rowStarting(root, "In a sandbox")?.querySelector<HTMLElement>('[role="gridcell"]')?.click(),
    );
    expect(root.querySelector("aside")?.textContent).toContain("What this step can do");
  });

  it("says a step ran without the sandbox, and a damaged event couldn't be read", async () => {
    const root = await openRun(
      [
        [0, entered("draft")],
        [
          0,
          { type: "sandbox.off", state: "draft", agent: "coder", chosenAt: "2026-11-10T08:00:00Z" },
        ],
        [0, opened({ strength: "os" })],
      ],
      true,
    );
    const off = rowStarting(root, "Ran on this computer, without the sandbox");
    expect(off).toBeDefined();
    expect(rowStarting(root, "Couldn't read what this step could do.")).toBeDefined();
    act(() => off?.querySelector<HTMLElement>('[role="gridcell"]')?.click());
    expect(root.querySelector("aside")?.textContent).toContain("Full access");
  });

  it("says your computer, not this computer, for a step that ran without the sandbox on a phone", async () => {
    const root = await openRun(
      [
        [0, entered("draft")],
        [
          0,
          { type: "sandbox.off", state: "draft", agent: "coder", chosenAt: "2026-11-10T08:00:00Z" },
        ],
      ],
      true,
      true,
    );
    const off = rowStarting(root, "Ran on your computer, without the sandbox");
    expect(off).toBeDefined();
    act(() => off?.querySelector<HTMLElement>('[role="gridcell"]')?.click());
    const text = root.querySelector("aside")?.textContent;
    expect(text).toContain("on your computer");
    expect(text).not.toContain("this computer");
  });

  it("opens a damaged event's entry with the same sentence, not an empty panel", async () => {
    const root = await openRun(
      [
        [0, entered("draft")],
        [0, opened({ strength: "os" })],
      ],
      true,
    );
    const line = rowStarting(root, "Couldn't read what this step could do.");
    act(() => line?.querySelector<HTMLElement>('[role="gridcell"]')?.click());
    const panel = root.querySelector("aside");
    expect(panel?.textContent).toContain("Couldn't read what this step could do.");
    expect(panel?.textContent).not.toContain("made no model or tool calls");
  });

  it("shows no line for a step with no sandbox event, as an old run", async () => {
    const root = await openRun([[0, entered("draft")]], true);
    expect(rowStarting(root, "In a sandbox")).toBeUndefined();
    expect(root.textContent).not.toContain("What it can do");
  });
});
