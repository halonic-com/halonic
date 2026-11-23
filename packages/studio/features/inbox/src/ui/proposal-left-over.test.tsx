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
  vi.restoreAllMocks();
});

/** Run `runId`'s proposal of one file, decided `decision`, not settled. */
function proposed(runId: string, decision: Decision): ProposedRecord {
  return {
    state: "proposed",
    proposal: {
      runId,
      history: "off",
      base: null,
      ref: null,
      files: [{ path: "notes/a.md", change: "modified", base: { digest: "sha256:d1" } }],
      items: ["support-triage"],
    },
    finishedAt: "2026-11-22T08:00:00.000Z",
    decisions: { "notes/a.md": decision },
  };
}

/**
 * A host where run `01JD8Q`'s proposal was accepted by a window that closed before it settled it,
 * and run `01JD7A`'s is open. Settling moves a proposal to the done list, unless `failing` says
 * how many settles fail first.
 */
function host(failing = 0) {
  let records = [proposed("01JD8Q", "accepted"), proposed("01JD7A", "undecided")];
  let failures = failing;
  const change = (runId: string, apply: (record: ProposedRecord) => ProposedRecord) => {
    records = records.map((record) => (record.proposal.runId === runId ? apply(record) : record));
  };
  const entries = (settled: boolean): RunProposalEntry[] =>
    records
      .filter((record) => (record.settled !== undefined) === settled)
      .map((record) => ({ record, run: undefined }));
  const decisions = {
    accept: vi.fn(async (runId: string) => {
      change(runId, (record) => ({ ...record, decisions: { "notes/a.md": "accepted" } }));
      return { undo: "u1", changedSinceRun: [], cantBeWritten: [] };
    }),
    reject: vi.fn(),
    undo: vi.fn(),
    settle: vi.fn(async (runId: string) => {
      if (failures > 0) {
        failures -= 1;
        throw new Error("The engine isn't answering.");
      }
      change(runId, (record) => ({
        ...record,
        settled: { at: "2026-11-22T09:00:00.000Z", why: "decided" },
      }));
    }),
    remove: vi.fn(),
  } satisfies ProposalDecisions;
  const { runs } = fakeRuns([]);
  const inbox = new Inbox({
    ...runs,
    proposals: async () => entries(false),
    doneProposals: async () => entries(true),
  });
  return { inbox, decisions };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openInbox(failing = 0) {
  const { inbox, decisions } = host(failing);
  await settle();
  const root = render(
    <InboxView inbox={inbox} proposals={decisions} now={() => new Date("2026-11-22T10:00:00Z")} />,
  );
  await settle();
  return { root, inbox, decisions };
}

verifies("inbox.proposal-left-over", () => {
  it("settles a proposal a closed window left decided, and lists it under Done", async () => {
    const { inbox, decisions } = await openInbox();

    expect(decisions.settle).toHaveBeenCalledExactlyOnceWith("01JD8Q");
    expect(inbox.state.done.map((item) => item.key)).toEqual(["done:01JD8Q"]);
    expect(inbox.state.decided).toEqual([]);
    expect(inbox.state.items.map((item) => item.key)).toEqual(["proposal:01JD7A"]);
  });

  it("leaves a proposal decided in this window to its page, which settles it once its toast has gone", async () => {
    const { root, inbox, decisions } = await openInbox();
    const cell = root.querySelector<HTMLElement>('[role="grid"] tr [role="gridcell"]');
    act(() => cell?.focus());
    await act(async () => {
      cell?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await press(buttons(root, "Accept all")[0]);
    await settle();

    expect(inbox.state.decided.map((item) => item.runId)).toEqual(["01JD7A"]);
    expect(inbox.state.leftOver).toEqual([]);
    expect(decisions.settle).not.toHaveBeenCalledWith("01JD7A");
  });

  it("asks again with the next load when settling fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { inbox, decisions } = await openInbox(1);
    expect(decisions.settle).toHaveBeenCalledOnce();
    expect(inbox.state.leftOver.map((item) => item.runId)).toEqual(["01JD8Q"]);

    await act(async () => inbox.refresh());
    await settle();

    expect(decisions.settle).toHaveBeenCalledTimes(2);
    expect(inbox.state.done.map((item) => item.key)).toEqual(["done:01JD8Q"]);
  });
});
