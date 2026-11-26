// @vitest-environment jsdom

import type { Decision, ProposedRecord, Settled } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { inboxSignal } from "../inbox-count.ts";
import type { ProposalDecisions } from "../proposal-decisions.ts";
import { doneItems, type RunProposalEntry } from "../proposal-items.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

afterEach(() => {
  unmountAll();
});

const paths = ["agents/triage.agent.yaml", "notes/a.md", "notes/b.md"];

/** Run `runId`'s proposal, settled at `at`, with one decision per file of `paths`. */
function done(
  runId: string,
  decisions: readonly Decision[],
  settled: Settled = { at: "2026-11-21T09:00:00.000Z", why: "decided" },
): RunProposalEntry {
  const record: ProposedRecord = {
    state: "proposed",
    proposal: {
      runId,
      history: "off",
      base: null,
      ref: null,
      files: paths.map((path) => ({ path, change: "modified", base: { digest: "sha256:d1" } })),
      items: ["support-triage"],
    },
    finishedAt: "2026-11-20T09:00:00.000Z",
    decisions: Object.fromEntries(
      paths.map((path, index) => [path, decisions[index] ?? "undecided"]),
    ),
    settled,
  };
  return { record, run: undefined };
}

const decisions: ProposalDecisions = {
  accept: vi.fn(),
  reject: vi.fn(),
  undo: vi.fn(),
  settle: vi.fn(),
  remove: vi.fn(),
  compare: vi.fn(),
  choose: vi.fn(),
};

const names = (id: string) => (id === "support-triage" ? "Support triage" : id);

/** The Inbox page with these done proposals and nothing waiting, once its first load has settled. */
async function inboxWithDone(entries: readonly RunProposalEntry[]) {
  const { runs } = fakeRuns([]);
  const inbox = new Inbox({ ...runs, doneProposals: async () => entries, itemName: names });
  const openRun = vi.fn();
  const root = render(
    <InboxView
      inbox={inbox}
      proposals={decisions}
      openRun={openRun}
      runFacts={() => ({ hubId: "support", workflow: "Support triage", startedBy: "a schedule" })}
      now={() => new Date("2026-11-22T10:00:00.000Z")}
    />,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { root, inbox, openRun };
}

const doneHeading = (root: HTMLElement) =>
  [...root.querySelectorAll("summary")].find((summary) => summary.textContent === "Done");

const doneCells = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('details [role="grid"] [role="gridcell"]'),
];

verifies("inbox.proposal-done", () => {
  describe("what a done proposal came to", () => {
    it.each([
      [["accepted", "accepted", "rejected"], "Accepted 2 of 3 changes"],
      [["rejected", "rejected", "rejected"], "Rejected"],
      [["undecided", "undecided", "undecided"], "Not reviewed"],
      [["rejected", "undecided", "undecided"], "Not reviewed"],
      [["accepted", "undecided", "undecided"], "Accepted 1 of 3 changes"],
    ] as const)("%j reads %s", async (decided, outcome) => {
      const { root } = await inboxWithDone([done("01JD8Q", decided)]);
      expect(doneCells(root)[0]?.textContent).toBe(
        `Run 01JD8Q proposes 3 changes to Support triage${outcome}`,
      );
    });
  });

  it("lists the one settled last first, keyed apart from Needs you", () => {
    const older = done("01JD7A", ["accepted"], { at: "2026-11-20T09:00:00.000Z", why: "expired" });
    const newer = done("01JD8Q", ["rejected"]);
    const open = { ...done("01JD9C", ["undecided"]), record: { ...older.record } };
    const { settled: _, ...unsettled } = open.record;
    const items = doneItems([older, newer, { ...open, record: unsettled }], names);
    expect(items.map((item) => item.key)).toEqual(["done:01JD8Q", "done:01JD7A"]);
  });

  it("shows a collapsed Done heading with no count, and counts nothing", async () => {
    const { root, inbox } = await inboxWithDone([done("01JD8Q", ["accepted", "accepted"])]);
    const heading = doneHeading(root);
    expect(heading?.closest("details")?.open).toBe(false);
    expect(heading?.textContent).toBe("Done");
    expect(inboxSignal(inbox.state.items)).toEqual(inboxSignal([]));
  });

  it("shows no Done heading while nothing is done", async () => {
    const { root } = await inboxWithDone([]);
    expect(doneHeading(root)).toBeUndefined();
  });

  it("opens a read-only summary with what was decided on each change and See run", async () => {
    const { root, openRun } = await inboxWithDone([
      done("01JD8Q", ["accepted", "rejected", "undecided"], {
        at: "2026-11-21T09:00:00.000Z",
        why: "expired",
      }),
    ]);
    const cell = doneCells(root)[0] as HTMLElement;
    act(() => cell.focus());
    act(() => {
      cell.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    const page = root.querySelector("section") as HTMLElement;
    expect(document.activeElement).toBe(page.querySelector("h2"));
    expect([...page.querySelectorAll("li")].map((line) => line.textContent)).toEqual([
      "agents/triage.agent.yaml changedAccepted",
      "notes/a.md changedRejected",
      "notes/b.md changedNot reviewed",
    ]);
    const buttons = [...page.querySelectorAll("button")].map((button) => button.textContent);
    expect(buttons).toEqual(["See run 01JD8Q ›"]);
    expect(page.textContent).toContain("Not reviewed");
    act(() => page.querySelector("button")?.click());
    expect(openRun).toHaveBeenCalledWith("support", "01JD8Q");
  });
});

verifies("inbox.plain-rows", () => {
  it("draws Done as plain rows too, the open done item with the soft fill and no bar", async () => {
    const { root } = await inboxWithDone([
      done("01JD8Q", ["accepted"]),
      done("01JD7A", ["rejected"]),
    ]);
    act(() => doneCells(root)[0]?.click());
    for (const cell of doneCells(root)) {
      expect(cell.className.split(" ")).toEqual(
        expect.arrayContaining(["rounded-l-md", "rounded-r-md"]),
      );
      expect(cell.className).not.toMatch(/border-t|selected-bar/);
    }
    const open = doneCells(root)[0] as HTMLElement;
    expect(open.getAttribute("aria-current")).toBe("true");
    expect(open.className.split(" ")).toContain("bg-surface-muted");
  });
});
