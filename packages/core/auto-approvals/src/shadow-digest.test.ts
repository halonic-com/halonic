import { createHash } from "node:crypto";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { chainEntry, type LedgerEntry } from "./ledger-entry.ts";
import { shadowDigest } from "./shadow-digest.ts";
import { owner, pinned } from "./shadow-runner.test-helper.ts";

const digest = {
  sha256: async (data: Uint8Array) => new Uint8Array(createHash("sha256").update(data).digest()),
};

/** A chain of `[time, approvalId, reason]` entries. */
async function chain(rows: [string, string, string][]): Promise<LedgerEntry[]> {
  const entries: LedgerEntry[] = [];
  for (const [time, approvalId, reason] of rows) {
    const input = {
      approvalId,
      payload: null,
      comments: [],
      outcome: "no_decision" as const,
      reason,
    };
    entries.push(await chainEntry(entries.at(-1) ?? null, input, new Date(time), digest));
  }
  return entries;
}

verifies("auto-approvals.shadow-runner", () => {
  describe("shadowDigest", () => {
    it("gives every count its denominator, leaves stopped time out and lists the revisions", async () => {
      const entries = await chain([
        ["2026-11-26T23:59:00.000Z", "p9", "card.touched"],
        ["2026-11-27T08:00:00.000Z", "run", "run.started"],
        ["2026-11-27T08:00:01.000Z", "p1", "card.untyped"],
        ["2026-11-27T08:00:02.000Z", "p2", "never_list.keyword"],
        ["2026-11-27T08:00:03.000Z", "p3", "card.untyped:requester_mismatch"],
        ["2026-11-27T08:00:04.000Z", "run", "poll.ran"],
        ["2026-11-27T09:00:00.000Z", "run", "stop.stopped"],
        ["2026-11-27T10:00:00.000Z", "p1", "card.touched"],
        ["2026-11-27T10:00:01.000Z", "run", "poll.ran"],
      ]);
      const neverList = pinned("d-never", "version: 2\n");
      const revision = {
        id: "r2",
        revisionNumber: 2,
        body: "version: 2\n",
        createdAt: "2026-11-27T09:30:00.000Z",
        authorUserId: owner,
        authorAgentId: null,
      };
      const text = shadowDigest({
        day: "2026-11-27",
        entries,
        calls: { sent: 42, refused: 0, refusedNotGet: 0, writesSent: 0 },
        documents: {
          neverList: { ...neverList, revisions: [...neverList.revisions, revision] },
          stop: pinned("d-stop", "stop: false\n"),
        },
        build: "abc1234",
        redTeam: { passed: 46, total: 46 },
        until: new Date("2026-11-27T12:00:00.000Z"),
      });
      expect(text).toBe(
        [
          "Auto approvals shadow digest, 2026-11-27 (UTC)",
          "Build: abc1234",
          `Ledger head: ${entries.at(-1)?.hash}`,
          "Red-team: 46 of 46 passed on build abc1234",
          "Stopped: 1 h 0 min of 12 h 0 min, left out of every count below",
          "Polls: 3, stopped: 1, restarts: 1",
          "- stopped by stop.stopped: 1",
          "Calls to Paperclip: 42 sent (only GETs can pass the guard), writes sent: 0, refused: 0 (0 of them writes)",
          "",
          "Kind untyped:",
          "- approvals seen: 3, evaluations: 4",
          "- untyped: 1 of 3",
          "- requester mismatch: 1 of 3: p3",
          "- never-listed: 1 of 3",
          "- near misses: not measured: no rules in v1",
          "- a rule would have approved what a person denied: not measured: no rules in v1",
          "- agreement with people: not measured: no rules in v1",
          "",
          "Reasons (each approval's latest today, of 3):",
          "- card.touched: 1 of 3",
          "- card.untyped:requester_mismatch: 1 of 3",
          "- never_list.keyword: 1 of 3",
          "",
          "never-list revisions today:",
          `- r2 at 09:30 UTC by user ${owner}`,
          "stop document revisions today: none",
        ].join("\n"),
      );
    });

    it("says when the red-team cases weren't run and the documents weren't read", () => {
      const text = shadowDigest({
        day: "2026-11-27",
        entries: [],
        calls: { sent: 0, refused: 0, refusedNotGet: 0, writesSent: 0 },
        build: "abc1234",
        until: new Date("2026-11-28T00:00:00.000Z"),
      });
      expect(text).toContain("Red-team: not run on build abc1234");
      expect(text).toContain("Ledger head: none");
      expect(text).toContain("never-list revisions today: not read");
      expect(text).toContain("- untyped: 0 of 0");
    });
  });
});
