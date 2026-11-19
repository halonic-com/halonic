// @vitest-environment jsdom

import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkflowView } from "../api.ts";
import { WorkflowScreen } from "../page/workflow-page.tsx";
import {
  buttonNamed,
  memoryHost,
  memoryRuns,
  runSummary,
  show,
  unmount,
} from "../test-support.tsx";
import { runAnnouncement } from "./run-announcement.ts";
import type { ShownRun } from "./run-strip.ts";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const reply: WorkflowView = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  initial: "read",
  steps: [
    { id: "read", type: "task" },
    { id: "draft", type: "task", agent: "writer" },
    { id: "done", type: "final" },
  ],
  arrows: [
    { from: "read", to: "draft" },
    { from: "draft", to: "done" },
  ],
  layout: {},
};

const runKey = "run:run_mfx3k2a1_01jd8q";

/** The run waiting for an approval in `draft`. */
const needsYou = runSummary({
  status: "waiting",
  approvals: [
    {
      agent: "writer",
      tool: "gmail_send",
      args: {},
      callId: "call-1",
      at: new Date(2026, 10, 9, 10, 41).toISOString(),
      state: "draft",
      branch: null,
      item: null,
    },
  ],
});
const running = runSummary({ status: "running", state: "draft" });
const finished = runSummary({
  status: "completed",
  state: "done",
  statesVisited: ["read", "draft", "done"],
  endedAt: "2026-11-09T10:45:00.000Z",
});

/** The page with Run, the card open, and what the announcer was asked to read. */
async function openCard(startRun = async () => ({ runId: "run_mfx3k2a1_01jd8q" })) {
  const runs = memoryRuns();
  const announceState = vi.fn<(key: string, text: string) => void>();
  const { host } = memoryHost([], [], [reply], [], { startRun: async () => startRun() });
  const page = await show(
    <WorkflowScreen
      host={host}
      runs={runs.source}
      hubId="acme"
      id="reply"
      announceState={announceState}
    />,
  );
  const runButton = [...page.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "Run",
  );
  await act(async () => runButton?.click());
  return { page, runs, announceState };
}

const press = (button: HTMLButtonElement | undefined) =>
  act(async () => {
    button?.click();
  });

const listRuns = (runs: ReturnType<typeof memoryRuns>, summaries: readonly RunSummary[]) =>
  act(async () => runs.change(summaries));

verifies("workflows.start.start-run-access", () => {
  it("reads each change of the docked run's state under the run's key, once", async () => {
    const { page, runs, announceState } = await openCard();
    await press(buttonNamed(page, "Start run"));

    await listRuns(runs, [running]);
    expect(announceState).not.toHaveBeenCalled();
    await listRuns(runs, [needsYou]);
    await listRuns(runs, [needsYou]);
    expect(announceState).toHaveBeenCalledTimes(1);
    expect(announceState).toHaveBeenLastCalledWith(
      runKey,
      "Run 01jd8q needs you, waiting in Draft.",
    );
    await listRuns(runs, [running]);
    expect(announceState).toHaveBeenLastCalledWith(runKey, "Run 01jd8q is running again.");
    await listRuns(runs, [finished]);
    expect(announceState).toHaveBeenLastCalledWith(runKey, "Run 01jd8q is done.");
  });

  it("says where the run failed", async () => {
    const { page, runs, announceState } = await openCard();
    await press(buttonNamed(page, "Start run"));

    await listRuns(runs, [
      runSummary({ status: "failed", endedAt: "2026-11-09T10:45:00.000Z", error: "x" }),
    ]);

    expect(announceState).toHaveBeenCalledWith(runKey, "Run 01jd8q failed in Draft.");
  });

  it("reads nothing once the run's card is closed", async () => {
    const { page, runs, announceState } = await openCard();
    await press(buttonNamed(page, "Start run"));
    await listRuns(runs, [running]);
    await press(
      page.querySelector<HTMLButtonElement>("aside button[aria-label='Close run']") ?? undefined,
    );

    await listRuns(runs, [finished]);

    expect(announceState).not.toHaveBeenCalled();
  });

  it("moves focus to the dock's line at once after Start run, then to the run's card", async () => {
    const { page, runs } = await openCard();
    await press(buttonNamed(page, "Start run"));

    expect(document.activeElement?.textContent).toBe("Run started. Waiting for it to appear…");
    await listRuns(runs, [running]);
    expect(document.activeElement?.tagName).toBe("H2");
    expect(document.activeElement?.closest("aside")?.getAttribute("aria-label")).toBe("Run 01jd8q");
  });

  it("moves focus to an input that isn't a JSON object, every time, so its error is read", async () => {
    const { page } = await openCard();
    const field = page.querySelector("textarea");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
        field,
        "[1]",
      );
      field?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const start = buttonNamed(page, "Start run");
    await press(start);
    expect(document.activeElement).toBe(field);
    expect(field?.getAttribute("aria-invalid")).toBe("true");
    const description = field?.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(description.split(" ")[0] ?? "")?.textContent).toContain(
      "The input has to be a JSON object, such as {}.",
    );
    start?.focus();
    await press(start);
    expect(document.activeElement).toBe(field);
  });
});

verifies("workflows.start.start-run-access", () => {
  const shown = (standing: ShownRun["standing"], step = "Draft reply") =>
    ({ runId: "r1", shortId: "4defa1", standing, step }) as ShownRun;

  it("says 19.3's canvas-strip words, with no second mark after a question", () => {
    expect(runAnnouncement(shown("needs-you", "Approve this reply?"), "running")).toBe(
      "Run 4defa1 needs you, waiting in Approve this reply?",
    );
    expect(runAnnouncement(shown("failed"), "running")).toBe("Run 4defa1 failed in Draft reply.");
    expect(runAnnouncement(shown("cancelled"), "running")).toBe(
      "Run 4defa1 was cancelled in the step Draft reply.",
    );
    expect(runAnnouncement(shown("done"), undefined)).toBe("Run 4defa1 is done.");
  });

  it("says nothing of a run that is only running, or a stop it has no words for", () => {
    expect(runAnnouncement(shown("running"), undefined)).toBeUndefined();
    expect(runAnnouncement(shown("running"), "failed")).toBeUndefined();
    expect(runAnnouncement(shown("budget"), "running")).toBeUndefined();
    expect(runAnnouncement(shown("waiting"), "running")).toBeUndefined();
    expect(runAnnouncement(shown("running"), "waiting")).toBe("Run 4defa1 is running again.");
  });
});
