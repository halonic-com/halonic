import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { type RecordedGate, refusedGate } from "../verdicts/gate.ts";
import { gateRow } from "./gate.ts";
import { headOf, pull, snapshot, testSettings } from "./merge-control.test-helper.ts";

const flagOn = { ...testSettings, verdictGate: true };

/** What the records say when Liam's recorded approval counts on #3's head. */
const liamRecorded: RecordedGate = {
  approved: true,
  reasons: [],
  approvals: [{ by: "Liam", head: headOf(3), counts: true, record: "record-1" }],
  holds: [],
  securityOk: false,
  author: "mateo",
};

verifies("paperclip.verdicts-gate", () => {
  describe("the merge gate and the board's flag", () => {
    test("flag off: Liam's line on GitHub approves, and records are never read", () => {
      // A record that would refuse it, to show the flag-off gate ignores the records.
      const facts = snapshot({
        pulls: [pull(3)],
        recorded: { "3": refusedGate("no recorded approval") },
      });
      const row = gateRow(facts, pull(3), testSettings);
      expect(row.noApproval).toBe(false);
      expect(row.pass).toBe(true);
    });

    test("flag off: the same row as before the flag, field by field", () => {
      const facts = snapshot({ pulls: [pull(3)] });
      const before = gateRow(facts, pull(3), testSettings);
      const withRecords = gateRow(
        { ...facts, recorded: { "3": liamRecorded } },
        pull(3),
        testSettings,
      );
      expect(withRecords).toEqual(before);
    });

    test("flag on: Liam's line on GitHub alone doesn't count", () => {
      const facts = snapshot({ pulls: [pull(3)] });
      const row = gateRow(facts, pull(3), flagOn);
      expect(row.noApproval).toBe(true);
      expect(row.pass).toBe(false);
      expect(row.reasons).toContain("the recorded verdicts weren't read this pass");
      // Not read is unread: it isn't added, nor removed from the queue for it.
      expect(row.verdictsUnread).toBe(true);
    });

    test("flag on: a recorded approval decides, with no line on GitHub", () => {
      const facts = snapshot({ pulls: [pull(3, { texts: [] })], recorded: { "3": liamRecorded } });
      const row = gateRow(facts, pull(3, { texts: [] }), flagOn);
      expect(row.approval).toEqual({ ok: true, julian: false, nora: false });
      expect(row.pass).toBe(true);
    });

    test("flag on: the records' refusal is the gate's reason", () => {
      const refused = refusedGate("who wrote it isn't clear: no hand-over");
      const facts = snapshot({ pulls: [pull(3)], recorded: { "3": refused } });
      const row = gateRow(facts, pull(3), flagOn);
      expect(row.pass).toBe(false);
      expect(row.reasons).toContain("who wrote it isn't clear: no hand-over");
      expect(row.verdictsUnread).toBe(false);
    });

    test("flag on: a recorded change request holds it", () => {
      const held: RecordedGate = {
        ...refusedGate("changes requested by Julian"),
        holds: [{ by: "Julian", head: headOf(3), at: "2026-11-24T11:00:00.000Z", record: "r-2" }],
      };
      const facts = snapshot({ pulls: [pull(3)], recorded: { "3": held } });
      const row = gateRow(facts, pull(3), flagOn);
      expect(row.changeRequest).toEqual({ who: "Julian", at: "2026-11-24T11:00:00.000Z" });
      expect(row.pass).toBe(false);
    });

    test("flag on: a security pull request waits for Julian's recorded security-ok on the head", () => {
      const security = pull(3, { texts: [], labels: ["built-on:paperclip", "security"] });
      const waiting = gateRow(
        snapshot({ pulls: [security], recorded: { "3": liamRecorded } }),
        security,
        flagOn,
      );
      expect(waiting.reasons).toContain(
        `security PR: waiting for Julian's recorded security-ok on head ${headOf(3).slice(0, 9)}`,
      );
      const signed = { ...liamRecorded, securityOk: true };
      const row = gateRow(
        snapshot({ pulls: [security], recorded: { "3": signed } }),
        security,
        flagOn,
      );
      expect(row.pass).toBe(true);
    });
  });
});
