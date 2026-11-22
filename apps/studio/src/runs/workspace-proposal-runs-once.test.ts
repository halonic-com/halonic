import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { ProposedRecord } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { WorkspaceRuns } from "./workspace-runs.ts";

function proposalOf(runId: string, settled = false): ProposedRecord {
  return {
    state: "proposed",
    proposal: {
      runId,
      history: "off",
      base: null,
      ref: null,
      files: [{ path: "notes.md", change: "added", base: "absent" }],
      items: ["triage"],
    },
    finishedAt: "2026-11-20T10:00:00.000Z",
    decisions: { "notes.md": settled ? "rejected" : "undecided" },
    ...(settled ? { settled: { at: "2026-11-21T09:00:00.000Z", why: "decided" } } : {}),
  };
}

/** The workspace's runs: one run, `01JD8Q`, and a count of how often they were read. */
function runsWithOne() {
  const run = { id: "01JD8Q", status: "completed" } as unknown as RunSummary;
  const list = vi.fn(async () => [run]);
  return { list, store: { list, events: async () => [] } };
}

const files = () => new MemoryDefinitionStore({ "workspace.yaml": "id: acme\nname: Acme\n" });

verifies("studio.workspace-proposal-runs-once", () => {
  it("reads the runs once when the Inbox asks for the open and the done proposals together", async () => {
    const { list, store } = runsWithOne();
    const runs = new WorkspaceRuns({
      runs: store,
      definitions: files(),
      proposals: async () => [proposalOf("01JD8Q")],
      doneProposals: async () => [proposalOf("01JD8Q", true), proposalOf("01GONE", true)],
    });

    const [open, done] = await Promise.all([runs.proposals(), runs.doneProposals()]);

    expect(list).toHaveBeenCalledTimes(1);
    expect(open.map((entry) => entry.run?.id)).toEqual(["01JD8Q"]);
    expect(done.map((entry) => [entry.record.proposal.runId, entry.run?.id])).toEqual([
      ["01JD8Q", "01JD8Q"],
      ["01GONE", undefined],
    ]);
  });

  it("reads them again for the next load", async () => {
    const { list, store } = runsWithOne();
    const runs = new WorkspaceRuns({
      runs: store,
      definitions: files(),
      proposals: async () => [proposalOf("01JD8Q")],
    });

    await Promise.all([runs.proposals(), runs.doneProposals()]);
    await Promise.all([runs.proposals(), runs.doneProposals()]);

    expect(list).toHaveBeenCalledTimes(2);
  });

  it("keeps the open proposals when only the done list fails, and the other way round", async () => {
    const failure = new Error("The host didn't answer.");
    const doneFails = new WorkspaceRuns({
      runs: runsWithOne().store,
      definitions: files(),
      proposals: async () => [proposalOf("01JD8Q")],
      doneProposals: async () => Promise.reject(failure),
    });
    const [open, done] = await Promise.allSettled([
      doneFails.proposals(),
      doneFails.doneProposals(),
    ]);
    expect(open.status === "fulfilled" && open.value.map((entry) => entry.run?.id)).toEqual([
      "01JD8Q",
    ]);
    expect(done).toEqual({ status: "rejected", reason: failure });

    const openFails = new WorkspaceRuns({
      runs: runsWithOne().store,
      definitions: files(),
      proposals: async () => Promise.reject(failure),
      doneProposals: async () => [proposalOf("01JD8Q", true)],
    });
    await expect(openFails.proposals()).rejects.toBe(failure);
    expect((await openFails.doneProposals()).map((entry) => entry.run?.id)).toEqual(["01JD8Q"]);
  });
});
