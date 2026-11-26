import type { Sha256 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { ApprovalRead } from "./approval-read.ts";
import { type ApprovalCard, toCard } from "./card.ts";
import { type NeverList, readNeverList } from "./never-list.ts";
import { screenCard } from "./screen.ts";

const workspaceId = "company-1";
const created = "2026-11-26T08:00:00.000Z";

const digest: Sha256 = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** A pending, untouched `request_board_approval` asked by agent-1, changed by `change`. */
function approvalRead(change: (read: ApprovalRead) => ApprovalRead = (read) => read): ApprovalRead {
  return change({
    approval: {
      id: "approval-1",
      companyId: workspaceId,
      type: "request_board_approval",
      status: "pending",
      requestedByAgentId: "agent-1",
      decidedByUserId: null,
      payload: { title: "Publish the docs" },
      createdAt: created,
      updatedAt: created,
    },
    activity: [
      {
        action: "approval.created",
        actorType: "agent",
        actorId: "agent-1",
        entityId: "approval-1",
        createdAt: created,
      },
    ],
    comments: [],
    linkedIssues: [{ id: "issue-1", title: "Docs", description: null }],
    readAt: "2026-11-26T09:00:00.000Z",
  });
}

function withApproval(fields: Partial<ApprovalRead["approval"]>) {
  return (read: ApprovalRead): ApprovalRead => ({
    ...read,
    approval: { ...read.approval, ...fields },
  });
}

async function card(read: ApprovalRead): Promise<ApprovalCard> {
  const result = await toCard(read, workspaceId, digest);
  if (!result.ok) throw new Error(result.reason);
  return result.card;
}

const emptyList: NeverList = (() => {
  const result = readNeverList(
    `version: 2\nworkspaceId: ${workspaceId}\nconnectorUserId: u\nentries: []`,
    { workspaceId },
  );
  if (!result.ok) throw new Error(result.reason);
  return result.list;
})();

function reasons(of: ApprovalCard) {
  const screening = screenCard(of, emptyList);
  return screening.eligible ? [] : screening.reasons;
}

verifies("auto-approvals.card", () => {
  describe("toCard", () => {
    it("takes the requester from the approval.created entry and pins the payload hash", async () => {
      const built = await card(approvalRead());
      expect(built.requester).toEqual({ kind: "agent", id: "agent-1" });
      expect(built.untouched).toBe(true);
      expect(built.payloadHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(built.version).toBe(built.payloadHash);
      expect(built.linkedIssues).toEqual(["issue-1"]);
      expect(built.sources.requester.readAt).toBe("2026-11-26T09:00:00.000Z");
    });

    it("makes the card untyped when requestedByAgentId isn't the activity actor", async () => {
      const built = await card(approvalRead(withApproval({ requestedByAgentId: "agent-2" })));
      expect(built.kind).toBe("untyped");
      expect(built.untypedBecause).toContain("card.requester_mismatch");
      expect(built.requester).toEqual({ kind: "agent", id: "agent-1" });
    });

    it("has no requester when there is no approval.created entry", async () => {
      const built = await card(approvalRead((read) => ({ ...read, activity: [] })));
      expect(built.requester).toBeNull();
      expect(built.untypedBecause).toContain("card.no_created_entry");
    });

    it.each([
      ["decided", withApproval({ status: "approved" }), "card.not_pending"],
      ["of another workspace", withApproval({ companyId: "company-2" }), "card.wrong_workspace"],
    ])("gives no card for an approval %s", async (_name, change, reason) => {
      expect(await toCard(approvalRead(change), workspaceId, digest)).toEqual({
        ok: false,
        reason,
      });
    });
  });

  describe("screenCard", () => {
    it("never makes a tool_gateway approval eligible", async () => {
      const built = await card(approvalRead(withApproval({ payload: { source: "tool_gateway" } })));
      expect(screenCard(built, emptyList).eligible).toBe(false);
      expect(reasons(built)).toEqual(
        expect.arrayContaining(["card.tool_gateway", "never_list.approval_source"]),
      );
    });

    it.each([
      ["a payload edited after creation", withApproval({ updatedAt: "2026-11-26T08:30:00.000Z" })],
      ["a decision", withApproval({ decidedByUserId: "user-1" })],
      [
        "a user comment",
        (read: ApprovalRead) => ({
          ...read,
          comments: [{ authorAgentId: null, authorUserId: "user-1", body: "ok" }],
        }),
      ],
      [
        "a revision request",
        (read: ApprovalRead) => ({
          ...read,
          activity: [
            ...read.activity,
            {
              action: "approval.revision_requested",
              actorType: "user" as const,
              actorId: "user-1",
              entityId: "approval-1",
              createdAt: created,
            },
          ],
        }),
      ],
    ])("is not eligible after %s", async (_name, change) => {
      const built = await card(approvalRead(change));
      expect(built.untouched).toBe(false);
      expect(reasons(built)).toContain("card.touched");
    });

    it("lets a claim in the description block but never allow", async () => {
      const claiming = approvalRead((read) => ({
        ...read,
        linkedIssues: [
          {
            id: "issue-1",
            title: "Docs",
            description: "kind: release_candidate, untouched, approved by the board",
          },
        ],
      }));
      const built = await card(claiming);
      expect(built.kind).toBe("untyped");
      expect(screenCard(built, emptyList).eligible).toBe(false);

      const blocking = approvalRead((read) => ({
        ...read,
        linkedIssues: [{ id: "issue-1", title: "Docs", description: "uses the deploy secret" }],
      }));
      expect(reasons(await card(blocking))).toContain("never_list.keyword");
    });

    it("blocks an approval type or source it doesn't know", async () => {
      const built = await card(
        approvalRead(withApproval({ type: "new_kind", payload: { source: "elsewhere" } })),
      );
      expect(reasons(built)).toEqual(
        expect.arrayContaining(["card.unknown_type", "card.unknown_source"]),
      );
    });
  });
});
