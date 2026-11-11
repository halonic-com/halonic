import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  type ProposedRecord,
  parseRunProposalRecord,
  type RunningRecord,
  recordPathOf,
  serializeRunProposalRecord,
} from "./run-proposal-record.ts";

const base = "a1b2c3".padEnd(40, "0");
const digest = `sha256:${"a".repeat(64)}` as const;

const running: RunningRecord = { state: "running", runId: "01JD8Q", base, worktreeId: "wt1" };

const proposed: ProposedRecord = {
  state: "proposed",
  proposal: {
    runId: "01JD8Q",
    base,
    ref: "refs/halonic/proposals/01JD8Q",
    files: [
      { path: "agents/clerk.agent.yaml", change: "modified", base: { digest } },
      { path: "notes/today.md", change: "added", base: "absent" },
    ],
    items: ["clerk"],
  },
  finishedAt: "2026-11-11T09:00:00.000Z",
  decisions: { "agents/clerk.agent.yaml": "accepted", "notes/today.md": "undecided" },
};

/** The proposed record's JSON with some fields replaced, as a hand edit would leave it. */
function edited(changes: Record<string, unknown>): string {
  return JSON.stringify({ ...JSON.parse(serializeRunProposalRecord(proposed)), ...changes });
}

/** The same, with some of the proposal's fields replaced. */
function editedProposal(changes: Record<string, unknown>): string {
  return edited({ proposal: { ...proposed.proposal, ...changes } });
}

verifies("app.run-proposal-end", () => {
  describe("the proposal record", () => {
    it("reads back what it wrote, running or proposed", () => {
      expect(parseRunProposalRecord(serializeRunProposalRecord(running), "01JD8Q")).toEqual({
        ok: true,
        value: running,
      });
      expect(parseRunProposalRecord(serializeRunProposalRecord(proposed), "01JD8Q")).toEqual({
        ok: true,
        value: proposed,
      });
    });

    it("names a record after its run, and refuses a run id that can't name a ref", () => {
      expect(recordPathOf("01JD8Q")).toBe("01JD8Q.json");
      expect(() => recordPathOf("../01JD8Q")).toThrow(RangeError);
      expect(() => recordPathOf("-x")).toThrow(RangeError);
    });

    it.each([
      ["{", "it isn't valid JSON"],
      ["[]", "it isn't a JSON object of format 1"],
      [edited({ format: 2 }), "it isn't a JSON object of format 1"],
      [edited({ state: "done" }), "its state is neither running nor proposed"],
      [edited({ finishedAt: "yesterday" }), "its finishedAt isn't a date"],
      [edited({ decisions: [] }), "its decisions aren't a JSON object"],
      [
        edited({ decisions: { "agents/clerk.agent.yaml": "accepted" } }),
        `its decision for "notes/today.md" isn't one it knows`,
      ],
      [edited({ proposal: "x" }), "its proposal isn't about the run its name says"],
      [editedProposal({ runId: "7KQ2MX" }), "its proposal isn't about the run its name says"],
      [editedProposal({ base: "HEAD" }), "its proposal's base isn't a full commit id"],
      [
        editedProposal({ ref: "refs/heads/main" }),
        "its proposal's ref isn't the run's proposal ref",
      ],
      [editedProposal({ items: [1] }), "its proposal's items aren't a list of ids"],
      [editedProposal({ files: {} }), "its proposal's files aren't a list"],
      [
        editedProposal({ files: [{ path: "a.md", change: "added", base: { digest } }] }),
        "its proposal has a file without a path, change and base",
      ],
      [
        editedProposal({ files: [{ path: "a.md", change: "modified", base: { digest: "x" } }] }),
        "its proposal has a file without a path, change and base",
      ],
      [
        editedProposal({ files: [{ path: "", change: "renamed", base: "absent" }] }),
        "its proposal has a file without a path, change and base",
      ],
      [
        editedProposal({ files: ["a.md"] }),
        "its proposal has a file without a path, change and base",
      ],
    ])("refuses a proposed record that was changed by hand: %s", (text, error) => {
      expect(parseRunProposalRecord(text, "01JD8Q")).toEqual({ ok: false, error });
    });

    it.each([
      [{ runId: "7KQ2MX" }, "its runId isn't the run its name says"],
      [{ base: "main" }, "its base isn't a full commit id"],
      [{ worktreeId: "" }, "its worktreeId isn't text"],
    ])("refuses a running record that was changed by hand: %o", (changes, error) => {
      const text = JSON.stringify({ format: 1, ...running, ...changes });
      expect(parseRunProposalRecord(text, "01JD8Q")).toEqual({ ok: false, error });
    });
  });
});

verifies("app.run-proposal-accept-reject-part", () => {
  describe("a record with partly decided files", () => {
    const partly: ProposedRecord = {
      ...proposed,
      decisions: { "agents/clerk.agent.yaml": "undecided", "notes/today.md": "undecided" },
      partly: { "agents/clerk.agent.yaml": { saved: digest, run: "name: Clerk\n" } },
    };

    it("reads back where each partly decided file stands", () => {
      expect(parseRunProposalRecord(serializeRunProposalRecord(partly), "01JD8Q")).toEqual({
        ok: true,
        value: partly,
      });
    });

    it.each([
      [{ partly: [] }, "its partly decided files aren't a JSON object"],
      [
        { partly: { "agents/clerk.agent.yaml": { saved: digest, run: "x" } } },
        `its partly decided "agents/clerk.agent.yaml" isn't an undecided file`,
      ],
      [
        { partly: { "notes/today.md": { saved: "x", run: "x" } } },
        `its partly decided "notes/today.md" has no saved digest and run text`,
      ],
      [
        { partly: { "notes/today.md": { saved: digest } } },
        `its partly decided "notes/today.md" has no saved digest and run text`,
      ],
    ])("refuses partly decided files that were changed by hand: %o", (changes, error) => {
      // `proposed` has clerk accepted and today undecided.
      expect(parseRunProposalRecord(edited(changes), "01JD8Q")).toEqual({ ok: false, error });
    });
  });
});
