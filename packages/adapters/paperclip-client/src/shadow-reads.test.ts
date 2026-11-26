import { checkPinnedDocuments } from "@halonicjs/auto-approvals";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { approvalId, company } from "./acme-data.test-helper.ts";
import { FakePaperclip } from "./fake-paperclip.test-helper.ts";
import {
  boardConnection,
  neverListDocument,
  pendingApproval,
  pinnedDocument,
  pinnedIssue,
  serveShadow,
  shadowReader,
  stopDocument,
} from "./shadow-data.test-helper.ts";
import { shadowAnswerMaxBytes } from "./shadow-reads.ts";

const documents = `/api/issues/${pinnedIssue}/documents`;
const otherCompany = "c0000000-0000-4000-8000-000000000009";
const otherApproval = "p0000000-0000-4000-8000-000000000009";

function reader(fake: FakePaperclip) {
  return shadowReader(fake, fake.fetch);
}

verifies("paperclip-client.shadow-reads", () => {
  describe("PaperclipShadowReader", () => {
    it("reads one approval with its created entry, comments and linked issues", async () => {
      const fake = serveShadow(new FakePaperclip());
      const read = await reader(fake).approval(approvalId);
      expect(read.approval).toMatchObject({ id: approvalId, status: "pending" });
      expect(read.activity).toEqual([
        expect.objectContaining({ action: "approval.created", actorType: "agent" }),
      ]);
      expect(read.linkedIssues).toEqual([
        { id: pinnedIssue, title: "Docs page", description: null },
      ]);
      const activity = fake.seen.find((request) => request.path.endsWith("/activity"));
      expect(Object.fromEntries(activity?.query ?? [])).toEqual({
        entityType: "approval",
        entityId: approvalId,
      });
    });

    it("asks only for pending approvals", async () => {
      const fake = serveShadow(new FakePaperclip());
      await expect(reader(fake).pendingApprovals()).resolves.toHaveLength(1);
      expect(fake.seen[0]?.query.get("status")).toBe("pending");
    });

    it("gives both pinned documents in the shape the never-list check takes", async () => {
      const fake = serveShadow(new FakePaperclip());
      const read = await reader(fake).pinnedDocuments(pinnedIssue);
      expect(read.neverList).toMatchObject({ id: neverListDocument, locked: true });
      expect(read.stop.revisions[0]).toMatchObject({
        authorUserId: boardConnection,
        authorAgentId: null,
      });
      const pins = {
        workspaceId: company,
        issueId: pinnedIssue,
        neverListDocumentId: neverListDocument,
        stopDocumentId: stopDocument,
        ownerUserIds: [boardConnection],
      };
      expect(
        checkPinnedDocuments(read, pins, { now: () => new Date("2026-11-26T12:00:00.000Z") }).ok,
      ).toBe(true);
    });

    it("reads an unlocked document as unlocked", async () => {
      const { document, revisions } = pinnedDocument(neverListDocument, "never-list", "x");
      const fake = serveShadow(new FakePaperclip())
        .on("GET", `${documents}/never-list`, { body: { ...document, lockedAt: null } })
        .on("GET", `${documents}/never-list/revisions`, { body: revisions });
      const read = await reader(fake).pinnedDocuments(pinnedIssue);
      expect(read.neverList.locked).toBe(false);
    });

    it.each([
      ["a 204 answer", { status: 204 }],
      ["a 500 answer", { status: 500, body: { error: "boom" } }],
      ["a 404 answer", { status: 404 }],
      ["a body that isn't JSON", { headers: { "content-type": "text/plain" }, body: "nope" }],
    ])("fails closed on %s", async (_, answer) => {
      const fake = serveShadow(new FakePaperclip()).on("GET", `${documents}/never-list`, answer);
      await expect(reader(fake).pinnedDocuments(pinnedIssue)).rejects.toThrow();
    });

    it("fails closed on an answer over the size limit", async () => {
      const big = "x".repeat(shadowAnswerMaxBytes);
      const fake = serveShadow(new FakePaperclip()).on("GET", `${documents}/never-list`, {
        body: { ...pinnedDocument(neverListDocument, "never-list", big).document },
      });
      await expect(reader(fake).pinnedDocuments(pinnedIssue)).rejects.toMatchObject({
        reason: "bad-answer",
      });
    });

    it.each([
      ["an approval", `/api/approvals/${approvalId}`, pendingApproval({ companyId: otherCompany })],
      [
        "a document",
        `${documents}/never-list`,
        {
          ...pinnedDocument(neverListDocument, "never-list", "x").document,
          companyId: otherCompany,
        },
      ],
      [
        "a revision",
        `${documents}/never-list/revisions`,
        pinnedDocument(neverListDocument, "never-list", "x").revisions.map((each) => ({
          ...each,
          companyId: otherCompany,
        })),
      ],
    ])("fails closed on %s for another company", async (_, path, body) => {
      const fake = serveShadow(new FakePaperclip()).on("GET", path, { body });
      const read = reader(fake);
      await expect(
        read.approval(approvalId).then(() => read.pinnedDocuments(pinnedIssue)),
      ).rejects.toMatchObject({
        reason: "bad-answer",
      });
    });

    it("fails closed on a revision of another document", async () => {
      const { revisions } = pinnedDocument(stopDocument, "auto-approve-stop", "x");
      const fake = serveShadow(new FakePaperclip()).on("GET", `${documents}/never-list/revisions`, {
        body: revisions,
      });
      await expect(reader(fake).pinnedDocuments(pinnedIssue)).rejects.toMatchObject({
        reason: "bad-answer",
      });
    });

    it("fails closed on activity for another entity", async () => {
      const fake = serveShadow(new FakePaperclip()).on(
        "GET",
        `/api/companies/${company}/activity`,
        {
          body: [
            {
              companyId: company,
              entityType: "issue",
              entityId: pinnedIssue,
              action: "issue.updated",
            },
          ],
        },
      );
      await expect(reader(fake).approval(approvalId)).rejects.toMatchObject({
        reason: "bad-answer",
      });
    });

    it.each([
      ["another approval", `/api/approvals/${approvalId}`, pendingApproval({ id: otherApproval })],
      [
        "a comment on another approval",
        `/api/approvals/${approvalId}/comments`,
        [{ companyId: company, approvalId: otherApproval, body: "ok", authorUserId: "u1" }],
      ],
    ])("fails closed on %s", async (_, path, body) => {
      const fake = serveShadow(new FakePaperclip()).on("GET", path, { body });
      await expect(reader(fake).approval(approvalId)).rejects.toMatchObject({
        reason: "bad-answer",
      });
    });

    it("counts a comment by neither or both kinds of author as unknown", async () => {
      const comment = {
        companyId: company,
        approvalId,
        body: "ok",
        authorAgentId: "a1",
        authorUserId: "u1",
      };
      const fake = serveShadow(new FakePaperclip()).on(
        "GET",
        `/api/approvals/${approvalId}/comments`,
        {
          body: [
            comment,
            { ...comment, authorAgentId: null, authorUserId: null },
            { ...comment, authorUserId: null },
          ],
        },
      );
      const read = await reader(fake).approval(approvalId);
      expect(read.comments.map((each) => each.authorType)).toEqual(["unknown", "unknown", "agent"]);
    });
  });
});
