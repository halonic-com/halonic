// @vitest-environment jsdom

import type { RunEventBody } from "@halonicjs/events";
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

const parentId = "run_mfx3k2a1_7k2m9p";
const childId = `${parentId}.3.1`;

// A for-each child's `workflow.finished` carries its item, which the body type doesn't list.
const itemFailed: RunEventBody & { item: number } = {
  type: "workflow.finished",
  state: "each",
  workflow: "support-reply",
  childRunId: childId,
  status: "failed",
  error: "boom",
  item: 1,
};

const parentError = 'Workflow "support-reply" failed in item 1 of for-each state "each": boom';

const parentFailed: RunEventBody = { type: "run.failed", state: "each", error: parentError };

const childFailed: RunEventBody = {
  type: "run.failed",
  state: "draft",
  error: "items are a text",
  reason: "error",
  cause: {
    kind: "not_found",
    code: "workflow.items-not-a-list",
    detail: { items: "{{input.topics}}", gives: "text" },
  },
};

/** The run page of a run whose for-each item's run failed, with that child's log or without it. */
async function openParent(childLog: "logged" | "gone", opened: string[] = []) {
  const parent = summaryWith({
    id: parentId,
    status: "failed",
    reason: "error",
    state: "each",
    statesVisited: ["each"],
    error: parentError,
    endedAt: mondayMorning.toISOString(),
  });
  const logs = {
    [parentId]: logOf(parentId, [
      [0, entered("each")],
      [1, itemFailed],
      [2, parentFailed],
    ]),
    ...(childLog === "logged" && {
      [childId]: logOf(childId, [
        [0, entered("draft")],
        [1, childFailed],
      ]),
    }),
  };
  const list = new RunsList(fakeSource([parent], logs).source);
  const root = render(
    <RunView
      list={list}
      runId={parentId}
      now={() => mondayMorning}
      openRun={(runId) => opened.push(runId)}
    />,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

verifies("runs.run-view.failed-child-run", () => {
  it("says why the item's run failed, from that run's own log", async () => {
    const root = await openParent("logged");
    expect(root.textContent).toContain(
      "Support reply failed in the step Each: the run it started for item 2 failed in the step Draft: its items ({{input.topics}}) are a text, not a list.",
    );
    expect(root.textContent).not.toContain("Halonic can't tell the cause yet.");
  });

  it("opens the item's run from Open run", async () => {
    const opened: string[] = [];
    const root = await openParent("logged", opened);
    const open = [...root.querySelectorAll("button")].find(
      (button) => button.textContent === "Open run 9p.3.1",
    );
    await act(async () => {
      open?.click();
    });
    expect(opened).toEqual([childId]);
  });

  it("keeps the run's own banner when the item's run log is gone", async () => {
    const root = await openParent("gone");
    expect(root.textContent).toContain(
      "Support reply failed in the step Each. Halonic can't tell the cause yet.",
    );
  });
});
