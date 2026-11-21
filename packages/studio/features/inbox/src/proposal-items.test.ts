import type { Decision, ProposedRecord } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { fakeRuns } from "./fake-runs.test-helper.ts";
import { Inbox } from "./inbox.ts";
import { waitingCount } from "./inbox-count.ts";
import { proposalItems } from "./proposal-items.ts";
import { pendingApproval, waitingRun } from "./test-runs.test-helper.ts";

const paths = ["agents/triage.agent.yaml", "notes/a.md", "notes/b.md"];

/** A proposal of run `runId`, made at `finishedAt`, with one decision per file of `paths`. */
function proposed(
  runId: string,
  decisions: readonly Decision[] = ["undecided", "undecided", "undecided"],
  fields: Partial<ProposedRecord> = {},
): ProposedRecord {
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
    finishedAt: "2026-11-10T09:00:00.000Z",
    decisions: Object.fromEntries(
      paths.map((path, index) => [path, decisions[index] ?? "undecided"]),
    ),
    ...fields,
  };
}

function ended(id: string, endedAt: string, fields: Partial<RunSummary> = {}): RunSummary {
  return waitingRun(id, { status: "completed", endedAt, lastWaitingAt: null, ...fields });
}

const names = (id: string) => (id === "support-triage" ? "Support triage" : id);

verifies("inbox.proposal-items", () => {
  it("lists one item per run, with every change and its items' names", () => {
    const run = ended("01JD8Q", "2026-11-10T10:12:00.000Z");
    const items = proposalItems([proposed("01JD8Q")], () => run, names);
    expect(items).toEqual([
      {
        kind: "proposal",
        key: "proposal:01JD8Q",
        runId: "01JD8Q",
        changes: 3,
        items: ["support-triage"],
        itemNames: ["Support triage"],
        ending: "finished",
        since: "2026-11-10T10:12:00.000Z",
      },
    ]);
  });

  describe("reads how the run ended from its record, never from the proposal", () => {
    const failed = (reason: RunSummary["reason"]) =>
      ended("01JD8Q", "2026-11-10T10:12:00.000Z", { status: "failed", reason });

    it.each([
      ["cancelled", "stopped"],
      ["budget", "stopped"],
      ["error", "failed"],
      ["interrupted", "failed"],
    ] as const)("a run that failed for %s reads %s", (reason, ending) => {
      const [item] = proposalItems([proposed("01JD8Q")], () => failed(reason));
      expect(item?.ending).toBe(ending);
    });

    it("says nothing of the ending when the run's record can't be read, and dates it by the proposal", () => {
      const [item] = proposalItems([proposed("01JD8Q")], () => undefined);
      expect(item).toMatchObject({ ending: null, since: "2026-11-10T09:00:00.000Z" });
    });
  });

  it("counts a file that can't be written, and leaves out a proposal with nothing left to decide", () => {
    const decided = proposed("01JD8Q", ["accepted", "accepted", "not-applicable"]);
    const open = proposed("7KQ2MX", ["accepted", "undecided", "not-applicable"]);
    const items = proposalItems([decided, open], () => undefined);
    expect(items.map((item) => [item.runId, item.changes])).toEqual([["7KQ2MX", 3]]);
  });

  it("keeps a proposal where no file can be written", () => {
    const record = proposed("01JD8Q", ["not-applicable", "not-applicable", "not-applicable"]);
    expect(proposalItems([record], () => undefined)).toHaveLength(1);
  });

  it("leaves out a settled proposal", () => {
    const settled = proposed("01JD8Q", undefined, {
      settled: { at: "2026-12-10T09:00:00.000Z", why: "expired" },
    });
    expect(proposalItems([settled], () => undefined)).toEqual([]);
  });

  it("puts proposals after the runs that wait for a person, newest first, and counts them", async () => {
    const waiting = waitingRun("r1", {
      approvals: [pendingApproval("call-1", "notes-mcp__create_note", "2026-11-10T08:00:00.000Z")],
    });
    const { runs } = fakeRuns([waiting]);
    const older = ended("01JD8Q", "2026-11-10T10:12:00.000Z");
    const newer = ended("7KQ2MX", "2026-11-10T11:30:00.000Z");
    runs.proposals = async () => [
      { record: proposed("01JD8Q"), run: older },
      { record: proposed("7KQ2MX"), run: newer },
    ];
    runs.itemName = (id) => names(id);
    const inbox = new Inbox(runs);
    await inbox.refresh();
    expect(inbox.state.items.map((item) => item.key)).toEqual([
      "r1:call-1",
      "proposal:7KQ2MX",
      "proposal:01JD8Q",
    ]);
    expect(waitingCount(inbox.state.items)).toBe(3);
    inbox.dispose();
  });

  it("keeps the last proposals and shows the error when they can't be read", async () => {
    const { runs } = fakeRuns([]);
    let failure: Error | undefined;
    runs.proposals = async () => {
      if (failure !== undefined) throw failure;
      return [{ record: proposed("01JD8Q"), run: undefined }];
    };
    const inbox = new Inbox(runs);
    await inbox.refresh();
    failure = new Error("The proposal records can't be read.");
    await inbox.refresh();
    expect(inbox.state.items.map((item) => item.key)).toEqual(["proposal:01JD8Q"]);
    expect(inbox.state.error).toBe(failure);
    inbox.dispose();
  });
});
