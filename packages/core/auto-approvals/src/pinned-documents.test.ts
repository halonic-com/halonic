import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  checkPinnedDocuments,
  type DocumentPins,
  type DocumentRevision,
  type PinnedDocument,
} from "./pinned-documents.ts";

const workspaceId = "acme-company";
const boardConnection = "acme-board-connection";
const pins: DocumentPins = {
  workspaceId,
  issueId: "acme-never-list-issue",
  neverListDocumentId: "acme-never-list",
  stopDocumentId: "acme-stop",
  ownerUserIds: [boardConnection],
};

const listText = `version: 2\nworkspaceId: ${workspaceId}\nentries:\n  - kind: keyword\n    value: payee\n`;
const writtenAt = Date.UTC(2026, 10, 26, 12);
const clock = fixedClock(writtenAt + 60_000, 0);

/** Revision `number` of a document, by the board connection unless `by` names an agent. */
function revision(number: number, body: string, by: "owner" | "agent" = "owner"): DocumentRevision {
  return {
    id: `rev-${number}`,
    revisionNumber: number,
    body,
    createdAt: new Date(writtenAt + number).toISOString(),
    authorUserId: by === "owner" ? boardConnection : null,
    authorAgentId: by === "agent" ? "acme-agent" : null,
  };
}

function document(
  id: string,
  revisions: readonly DocumentRevision[],
  extra: Partial<PinnedDocument> = {},
): PinnedDocument {
  return {
    id,
    issueId: pins.issueId,
    companyId: workspaceId,
    locked: true,
    latestRevisionId: revisions.at(-1)?.id ?? null,
    revisions,
    ...extra,
  };
}

const goodList = document(pins.neverListDocumentId, [revision(1, listText)]);
const goingStop = document(pins.stopDocumentId, [revision(1, "stop: false\n")], { locked: false });

function check(documents: { neverList?: PinnedDocument; stop?: PinnedDocument }) {
  return checkPinnedDocuments({ neverList: goodList, stop: goingStop, ...documents }, pins, clock);
}

verifies("auto-approvals.pinned-documents", () => {
  describe("checkPinnedDocuments", () => {
    it("gives the never-list in force while both documents check out", () => {
      const gate = check({});
      expect(gate.ok && gate.list.entries).toContainEqual({ kind: "keyword", value: "payee" });
    });

    it.each([
      [
        "an agent writes `stop: false` after the owner",
        [revision(1, "stop: false\n"), revision(2, "stop: false\n", "agent")],
        "stop.not_owner_latest",
      ],
      [
        "an agent writes anything at all",
        [revision(1, "stop: false\n"), revision(2, "please go on", "agent")],
        "stop.not_owner_latest",
      ],
      ["an owner writes `stop: true`", [revision(1, "stop: true\n")], "stop.stopped"],
      ["an owner writes something else", [revision(1, "stop: no\n")], "stop.unreadable"],
      ["an owner adds a field", [revision(1, "stop: false\nreason: x\n")], "stop.unreadable"],
      ["it has no revision", [], "stop.missing"],
      [
        "two revisions share the newest number",
        [revision(2, "stop: false\n"), revision(2, "stop: true\n")],
        "stop.missing",
      ],
    ])("stops when %s", (_, revisions, reason) => {
      expect(check({ stop: document(pins.stopDocumentId, revisions) })).toEqual({
        ok: false,
        reason,
      });
    });

    it("stops when the stop document's latest revision isn't the newest it lists", () => {
      const stale = document(pins.stopDocumentId, [revision(1, "stop: false\n")], {
        latestRevisionId: "rev-2",
      });
      expect(check({ stop: stale })).toEqual({ ok: false, reason: "stop.missing" });
    });

    it.each([
      ["another document id", { id: "acme-other" }],
      ["another issue", { issueId: "acme-other-issue" }],
      ["another company", { companyId: "acme-other-company" }],
    ])("refuses a stop document with %s", (_, extra) => {
      const moved = document(pins.stopDocumentId, [revision(1, "stop: false\n")], extra);
      expect(check({ stop: moved })).toEqual({ ok: false, reason: "stop.wrong_document" });
    });

    it.each([
      ["another document id", { id: "acme-other" }],
      ["another issue", { issueId: "acme-other-issue" }],
      ["another company", { companyId: "acme-other-company" }],
    ])("refuses a never-list with %s", (_, extra) => {
      const moved = document(pins.neverListDocumentId, [revision(1, listText)], extra);
      expect(check({ neverList: moved })).toEqual({
        ok: false,
        reason: "never_list.wrong_document",
      });
    });

    it("stops when the never-list is unlocked", () => {
      const unlocked = document(pins.neverListDocumentId, [revision(1, listText)], {
        locked: false,
      });
      expect(check({ neverList: unlocked })).toEqual({ ok: false, reason: "never_list.unlocked" });
    });

    it("stops when the never-list's newest revision is an agent's", () => {
      const edited = document(pins.neverListDocumentId, [
        revision(1, listText),
        revision(2, listText, "agent"),
      ]);
      expect(check({ neverList: edited })).toEqual({
        ok: false,
        reason: "never_list.not_owner_latest",
      });
    });

    it("stops when a user who isn't an owner wrote the newest revision", () => {
      const byOther = { ...revision(2, listText), authorUserId: "acme-operator" };
      const edited = document(pins.neverListDocumentId, [revision(1, listText), byOther]);
      expect(check({ neverList: edited })).toEqual({
        ok: false,
        reason: "never_list.not_owner_latest",
      });
    });

    it("stops when the never-list's latest revision isn't the newest it lists", () => {
      const stale = document(pins.neverListDocumentId, [revision(1, listText)], {
        latestRevisionId: "rev-2",
      });
      expect(check({ neverList: stale })).toEqual({
        ok: false,
        reason: "never_list.stale_revision",
      });
    });

    it("checks the stop document first, because anyone may stop", () => {
      const unlocked = document(pins.neverListDocumentId, [revision(1, listText)], {
        locked: false,
      });
      const stopped = document(pins.stopDocumentId, [revision(1, "stop: true\n")]);
      expect(check({ neverList: unlocked, stop: stopped })).toEqual({
        ok: false,
        reason: "stop.stopped",
      });
    });
  });
});
