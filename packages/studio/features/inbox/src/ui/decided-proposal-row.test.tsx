// @vitest-environment jsdom

import type { Decision, ProposedRecord } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import type { ProposalDecisions } from "../proposal-decisions.ts";
import type { RunProposalEntry } from "../proposal-items.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";
import { buttons, press } from "./proposal-card.test-helper.tsx";

afterEach(() => {
  unmountAll();
});

const paths = ["agents/triage.agent.yaml", "notes/a.md", "notes/b.md"];

/** Run `runId`'s proposal, which ended at `finishedAt`, with every file undecided. */
function proposed(runId: string, finishedAt: string): ProposedRecord {
  return {
    state: "proposed",
    proposal: {
      runId,
      history: "off",
      base: null,
      ref: null,
      files: paths.map((path) => ({ path, change: "modified", base: { digest: "sha256:d1" } })),
      items: ["support-triage"],
    },
    finishedAt,
    decisions: Object.fromEntries(paths.map((path) => [path, "undecided" as Decision])),
  };
}

/**
 * A host with two open proposals, `01JD8Q` the newer: an Accept on a run decides every file of
 * it, and settling it moves it to the done list.
 */
function host() {
  let records = [
    proposed("01JD8Q", "2026-11-22T08:00:00.000Z"),
    proposed("01JD7A", "2026-11-22T07:00:00.000Z"),
  ];
  const change = (runId: string, apply: (record: ProposedRecord) => ProposedRecord) => {
    records = records.map((record) => (record.proposal.runId === runId ? apply(record) : record));
  };
  const entries = (settled: boolean): RunProposalEntry[] =>
    records
      .filter((record) => (record.settled !== undefined) === settled)
      .map((record) => ({ record, run: undefined }));
  const decisions = {
    accept: vi.fn(async (runId: string) => {
      change(runId, (record) => ({
        ...record,
        decisions: Object.fromEntries(paths.map((path) => [path, "accepted" as Decision])),
      }));
      return { undo: "u1", changedSinceRun: [], cantBeWritten: [] };
    }),
    reject: vi.fn(),
    undo: vi.fn(),
    settle: vi.fn(async (runId: string) => {
      change(runId, (record) => ({
        ...record,
        settled: { at: "2026-11-22T09:00:00.000Z", why: "decided" },
      }));
    }),
    remove: vi.fn(),
    compare: vi.fn(),
    choose: vi.fn(),
  } satisfies ProposalDecisions;
  const { runs } = fakeRuns([]);
  const inbox = new Inbox({
    ...runs,
    proposals: async () => entries(false),
    doneProposals: async () => entries(true),
    itemName: (id) => (id === "support-triage" ? "Support triage" : id),
  });
  return { inbox, decisions };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openInbox() {
  const { inbox, decisions } = host();
  const root = render(
    <InboxView inbox={inbox} proposals={decisions} now={() => new Date("2026-11-22T10:00:00Z")} />,
  );
  await settle();
  return { root, inbox, decisions };
}

/** Needs you's rows, the Done heading's left out. */
const needsYouRows = (root: HTMLElement) => [
  ...(root.querySelector('[role="grid"]')?.querySelectorAll<HTMLElement>("tr") ?? []),
];

async function openRow(row: HTMLElement | undefined) {
  const cell = row?.querySelector<HTMLElement>('[role="gridcell"]');
  act(() => cell?.focus());
  await act(async () => {
    cell?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

async function acceptAll(root: HTMLElement) {
  await press(buttons(root, "Accept all")[0]);
  await settle();
}

verifies("inbox.proposal-decided-row", () => {
  it("drops a decided proposal from the count, and keeps its row in place, muted, saying what it came to", async () => {
    const { root, inbox } = await openInbox();
    expect(root.textContent).toContain("2 waiting");
    await openRow(needsYouRows(root)[0]);
    await acceptAll(root);

    expect(inbox.state.items.map((item) => item.key)).toEqual(["proposal:01JD7A"]);
    expect(root.textContent).toContain("1 waiting");
    const [first, second] = needsYouRows(root);
    expect(first?.getAttribute("aria-current")).toBe("true");
    expect(first?.textContent).toContain("Run 01JD8Q proposes 3 changes to Support triage");
    expect(first?.textContent).toContain("Accepted 3 changes");
    expect(first?.querySelector(".text-fg-muted:not([aria-hidden])")?.textContent).toBe(
      "Run 01JD8Q proposes 3 changes to Support triage",
    );
    expect(second?.textContent).toContain("Run 01JD7A");
  });

  it("drops the muted row once another row is selected", async () => {
    const { root } = await openInbox();
    await openRow(needsYouRows(root)[0]);
    await acceptAll(root);
    await openRow(needsYouRows(root)[1]);

    const rows = needsYouRows(root);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("Run 01JD7A");
  });

  it("settles the proposal once the Inbox is left, and lists it under Done", async () => {
    const { root, inbox, decisions } = await openInbox();
    await openRow(needsYouRows(root)[0]);
    await acceptAll(root);
    unmountAll();
    await settle();

    expect(decisions.settle).toHaveBeenCalledWith("01JD8Q");
    expect(inbox.state.done.map((item) => item.key)).toEqual(["done:01JD8Q"]);
    expect(inbox.state.decided).toEqual([]);
  });
});
