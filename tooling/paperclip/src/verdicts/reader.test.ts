import { verifies } from "@halonicjs/testing-spec";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { describe, expect, test } from "vitest";
import { manifest } from "../plugin/manifest.ts";
import { judgeVerdicts, type VerdictPull, verdictsFor } from "./reader.ts";
import { readVerdict, type VerdictRecord, verdictEntityType } from "./record.ts";
import { entityVerdicts } from "./store.ts";

const repo = "halonic-com/halonic";
const head = "a".repeat(40);
const older = "b".repeat(40);

/** A pull request Mateo wrote, Julian's to review by its paths, at `head` with fingerprint `fp-1`. */
const pull: VerdictPull = {
  head,
  fingerprint: "fp-1",
  author: "mateo",
  reviewer: "julian",
  routineRefusal:
    "changes a plugin manifest (tooling/paperclip/src/plugin/manifest.ts): Julian approves it",
};

let count = 0;

/** A record of `verdict` by `reviewer`, on `head` unless given, stored in the order made. */
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
    fingerprint: "fp-1",
    verdict,
    reviewer,
    agentId: `agent-${reviewer}`,
    runId: `run-${count}`,
    task: "HAL-1",
    at: `2026-11-26T10:${String(count).padStart(2, "0")}:00.000Z`,
    ...more,
  };
}

verifies("paperclip.verdicts-reader", () => {
  describe("judgeVerdicts", () => {
    test("an approval counts on the head it names by its full SHA", () => {
      const verdicts = judgeVerdicts([record("julian", "approved")], pull);
      expect(verdicts.approved).toBe(true);
      expect(verdicts.approvals[0]).toMatchObject({ by: "Julian", head, counts: true });
    });

    test("an approval carries to a new head only with the same fingerprint", () => {
      const rebased = judgeVerdicts([record("julian", "approved", { head: older })], pull);
      expect(rebased.approved).toBe(true);
      expect(rebased.approvals[0]).toMatchObject({ head, carriedFrom: older, counts: true });

      const changed = judgeVerdicts(
        [record("julian", "approved", { head: older, fingerprint: "fp-0" })],
        pull,
      );
      expect(changed.approved).toBe(false);
      expect(changed.approvals[0]).toMatchObject({
        head: older,
        counts: false,
        note: "names an older head with other changes",
      });
    });

    test("without a fingerprint on either side, only the same head counts", () => {
      const unknownNow = { ...pull, fingerprint: null };
      const recordedOld = record("julian", "approved", { head: older, fingerprint: null });
      expect(judgeVerdicts([recordedOld], unknownNow).approved).toBe(false);
      expect(
        judgeVerdicts([record("julian", "approved", { head: older })], unknownNow).approved,
      ).toBe(false);
      expect(
        judgeVerdicts([record("julian", "approved", { fingerprint: null })], unknownNow).approved,
      ).toBe(true);
    });

    test("the HAL-14809 rules apply on the current head: limits and own pull requests", () => {
      const liamPaths = {
        ...pull,
        reviewer: "liam" as const,
        routineRefusal: "outside the second reviewer's limits",
      };
      expect(judgeVerdicts([record("julian", "approved")], liamPaths).approved).toBe(false);
      expect(judgeVerdicts([record("liam", "approved")], liamPaths).approved).toBe(true);
      const own = { ...pull, author: "julian" };
      expect(judgeVerdicts([record("julian", "approved")], own).approvals[0]).toMatchObject({
        counts: false,
        note: "the author's own pull request",
      });
      expect(judgeVerdicts([record("chief", "approved")], pull).approvals[0]).toMatchObject({
        counts: false,
        note: "not a reviewer",
      });
    });

    test("Nora's approval counts only within the routine scope", () => {
      expect(judgeVerdicts([record("nora", "approved")], pull).approvals[0]).toMatchObject({
        counts: false,
      });
      const liamPaths = {
        ...pull,
        reviewer: "liam" as const,
        routineRefusal: "not written by the team",
      };
      expect(judgeVerdicts([record("nora", "approved")], liamPaths).approved).toBe(false);
      const routine = { ...pull, routineRefusal: null };
      expect(judgeVerdicts([record("nora", "approved")], routine).approved).toBe(true);
    });

    test("a change request holds every head until the same reviewer approves or withdraws", () => {
      const held = judgeVerdicts(
        [record("liam", "changes-requested", { head: older }), record("julian", "approved")],
        pull,
      );
      expect(held.approved).toBe(false);
      expect(held.holds).toMatchObject([{ by: "Liam", head: older }]);

      const withdrawn = judgeVerdicts(
        [
          record("liam", "changes-requested", { head: older }),
          record("julian", "approved"),
          record("liam", "withdrawn"),
        ],
        pull,
      );
      expect(withdrawn.approved).toBe(true);
      expect(withdrawn.holds).toEqual([]);

      const otherReviewer = judgeVerdicts(
        [record("julian", "changes-requested"), record("liam", "approved")],
        pull,
      );
      expect(otherReviewer.holds).toMatchObject([{ by: "Julian" }]);
      expect(otherReviewer.approved).toBe(false);
    });

    test("security-ok counts only on the exact head, and only Julian's", () => {
      expect(judgeVerdicts([record("julian", "security-ok")], pull).securityOkOnHead).toBe(true);
      expect(
        judgeVerdicts([record("julian", "security-ok", { head: older })], pull).securityOkOnHead,
      ).toBe(false);
      expect(judgeVerdicts([record("liam", "security-ok")], pull).securityOkOnHead).toBe(false);
      expect(judgeVerdicts([record("julian", "security-ok")], pull).approved).toBe(false);
    });
  });

  describe("verdictsFor and the store", () => {
    test("a store that can't be read gives unknown, never approved", async () => {
      const failing = {
        append: async () => {
          throw new Error("unused");
        },
        list: async () => {
          throw new Error("Paperclip answered 503");
        },
      };
      expect(await verdictsFor(failing, repo, 7, pull)).toEqual({
        state: "unknown",
        reason: "the verdicts couldn't be read: Paperclip answered 503",
      });
    });

    test("each append adds a record, and the reader reads them back oldest first", async () => {
      const harness = createTestHarness({ manifest, config: {} });
      const store = entityVerdicts(harness.ctx.entities, "acme");
      const { id: _id, at: _at, ...draft } = record("liam", "changes-requested");
      await store.append(draft);
      // The test host stamps records by the millisecond; one reviewer's calls are seconds apart.
      await new Promise((resolve) => setTimeout(resolve, 5));
      await store.append({ ...draft, verdict: "withdrawn" });
      const read = await verdictsFor(store, repo, 7, pull);
      expect(read.state).toBe("read");
      const records = await store.list(repo, 7);
      expect(records.map((stored) => stored.verdict)).toEqual(["changes-requested", "withdrawn"]);
      expect(await store.list(repo, 8)).toEqual([]);
    });

    test("an entity changed after it was stored, or of another pull request, is left out", () => {
      const stored = {
        id: "entity-1",
        entityType: verdictEntityType(repo, 7),
        scopeKind: "company" as const,
        scopeId: "acme",
        externalId: "x",
        title: null,
        status: null,
        data: { ...record("julian", "approved") },
        createdAt: "2026-11-26T10:00:00.000Z",
        updatedAt: "2026-11-26T10:00:00.000Z",
      };
      expect(readVerdict(stored, repo, 7)).toMatchObject({ id: "entity-1", verdict: "approved" });
      expect(readVerdict({ ...stored, updatedAt: "2026-11-26T11:00:00.000Z" }, repo, 7)).toBe(
        undefined,
      );
      expect(readVerdict(stored, repo, 8)).toBe(undefined);
      expect(readVerdict({ ...stored, data: { ...stored.data, head: "abc1234" } }, repo, 7)).toBe(
        undefined,
      );
    });
  });
});
