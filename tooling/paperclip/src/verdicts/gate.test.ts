import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import type { AuthorComment } from "./author.ts";
import type { GateVerdictPull, RecordedSource } from "./gate.ts";
import { recordedGateOf } from "./gate-read.ts";
import type { VerdictRecord } from "./record.ts";

const repo = "halonic-com/halonic";
const head = "a".repeat(40);

/** #7 on Mateo's branch, opened by the shared account, Liam's to review by its paths. */
const pull: GateVerdictPull = {
  repo,
  number: 7,
  head,
  branch: "mateo/HAL-1-thing",
  ownBranch: true,
  openedBy: "halonic-dev",
  filesTotal: 2,
  filesRead: 2,
  reviewer: "liam",
  routineRefusal: "a security path: Liam reviews it",
  fingerprint: null,
  manifestFile: undefined,
};

/** Mateo's hand-over of #7 on HAL-1, the task its branch names. */
const handOver: AuthorComment = {
  authorAgentId: "agent-mateo",
  origin: "comment",
  body: "Ready for review: halonic#7.",
};

let count = 0;

function record(
  reviewer: string,
  verdict: VerdictRecord["verdict"],
  more: Partial<VerdictRecord> = {},
): VerdictRecord {
  count += 1;
  return {
    id: `record-${count}`,
    repo,
    pr: 7,
    head,
    fingerprint: null,
    verdict,
    reviewer,
    agentId: `agent-${reviewer}`,
    runId: `run-${count}`,
    task: "HAL-1",
    at: `2026-11-26T10:${String(count).padStart(2, "0")}:00.000Z`,
    ...more,
  };
}

/** A source over the given records and HAL-1's comments; `failing` makes the records unreadable. */
function source(
  records: readonly VerdictRecord[],
  comments: readonly AuthorComment[] = [handOver],
  failing?: "records" | "comments",
): RecordedSource {
  return {
    store: {
      list: async () => {
        if (failing === "records") throw new Error("Paperclip is down.");
        return [...records];
      },
      append: async () => {
        throw new Error("the gate never writes");
      },
    },
    teamLogin: "halonic-dev",
    taskComments: async (identifier) => {
      if (failing === "comments") throw new Error("Paperclip is down.");
      return identifier === "HAL-1" ? comments : [];
    },
    agents: async () => [
      { id: "agent-mateo", urlKey: "mateo" },
      { id: "agent-liam", urlKey: "liam" },
      { id: "agent-julian", urlKey: "julian" },
    ],
  };
}

verifies("paperclip.verdicts-gate", () => {
  describe("recordedGateOf", () => {
    test("Liam's recorded approval on the head approves it", async () => {
      const gate = await recordedGateOf(source([record("liam", "approved")]), pull);
      expect(gate).toMatchObject({ approved: true, reasons: [], author: "mateo" });
    });

    test("no record, no approval: PR comments never reach it", async () => {
      const gate = await recordedGateOf(source([]), pull);
      expect(gate).toMatchObject({ approved: false, reasons: ["no recorded approval"] });
    });

    test("a recorded change request holds it", async () => {
      const records = [record("liam", "approved"), record("julian", "changes-requested")];
      const gate = await recordedGateOf(source(records), pull);
      expect(gate.approved).toBe(false);
      expect(gate.reasons).toEqual([
        `changes requested by Julian (recorded on ${head.slice(0, 9)})`,
      ]);
    });

    test("a changed-files list GitHub cut short is not approved, whatever the records say", async () => {
      const cut = { ...pull, filesTotal: 3001, filesRead: 3000 };
      const gate = await recordedGateOf(source([record("liam", "approved")]), cut);
      expect(gate).toMatchObject({
        approved: false,
        reasons: [
          "only 3000 of its 3001 changed files were read: the review rules can't be checked",
        ],
      });
    });

    test("files not read at all (no reviewer by the paths) are not approved", async () => {
      const unread = { ...pull, reviewer: undefined };
      const gate = await recordedGateOf(source([record("liam", "approved")]), unread);
      expect(gate.approved).toBe(false);
    });

    describe("the author comes from authorOf, not the branch name", () => {
      test("a branch naming Mateo without his hand-over on the task has no author", async () => {
        const gate = await recordedGateOf(source([record("liam", "approved")], []), pull);
        expect(gate.approved).toBe(false);
        expect(gate.reasons[0]).toMatch(/^who wrote it isn't clear: mateo, whom the branch names/);
      });

      test("a hand-over that isn't the agent's own comment doesn't count", async () => {
        const receipt = { ...handOver, origin: "fast_response" };
        const gate = await recordedGateOf(source([record("liam", "approved")], [receipt]), pull);
        expect(gate.approved).toBe(false);
      });

      test("a branch named for Liam on his own approval: the opener decides, not the branch", async () => {
        // Opened by another account: that account is the author, whatever the branch says.
        const outside = { ...pull, branch: "liam/HAL-1-thing", openedBy: "Someone-Else" };
        const gate = await recordedGateOf(source([record("liam", "approved")]), outside);
        expect(gate).toMatchObject({ approved: true, author: "someone-else" });
      });

      test("the author's own recorded approval doesn't count", async () => {
        const own = { ...pull, branch: "liam/HAL-1-thing" };
        const liamHandOver = { ...handOver, authorAgentId: "agent-liam" };
        const gate = await recordedGateOf(
          source([record("liam", "approved")], [liamHandOver]),
          own,
        );
        expect(gate).toMatchObject({ approved: false, author: "liam" });
      });
    });

    describe("fails closed", () => {
      test("records that can't be read are not approved", async () => {
        const gate = await recordedGateOf(
          source([record("liam", "approved")], [handOver], "records"),
          pull,
        );
        expect(gate).toMatchObject({ approved: false });
        expect(gate.reasons[0]).toMatch(/^the verdicts couldn't be read: Paperclip is down/);
      });

      test("task comments that can't be read are not approved", async () => {
        const gate = await recordedGateOf(
          source([record("liam", "approved")], [handOver], "comments"),
          pull,
        );
        expect(gate).toMatchObject({ approved: false });
        expect(gate.reasons[0]).toMatch(
          /^the recorded verdicts couldn't be read: Paperclip is down/,
        );
      });
    });

    test("a plugin manifest change needs Julian's recorded approval too", async () => {
      const manifest = { ...pull, manifestFile: "tooling/paperclip/src/plugin/manifest.ts" };
      const liamOnly = await recordedGateOf(source([record("liam", "approved")]), manifest);
      expect(liamOnly.approved).toBe(false);
      expect(liamOnly.reasons[0]).toMatch(/needs Julian's recorded approval on head/);
      const both = [record("liam", "approved"), record("julian", "approved")];
      expect((await recordedGateOf(source(both), manifest)).approved).toBe(true);
    });

    test("Julian's security-ok counts only on the exact head", async () => {
      const records = [record("liam", "approved"), record("julian", "security-ok")];
      expect((await recordedGateOf(source(records), pull)).securityOk).toBe(true);
      const older = [
        record("liam", "approved"),
        record("julian", "security-ok", { head: "b".repeat(40) }),
      ];
      expect((await recordedGateOf(source(older), pull)).securityOk).toBe(false);
    });
  });
});
