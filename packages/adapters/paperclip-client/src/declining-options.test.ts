import type { InboxItem } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { agentAda, agentBo, me } from "./acme-data.test-helper.ts";
import { joinRequestToItem, secretProposalToItem } from "./board-request-items.ts";
import { approvalToItem, cardToItem } from "./cards.ts";
import { decisionToItem } from "./decisions.ts";
import { PaperclipIds } from "./ids.ts";

const context = {
  ids: new PaperclipIds("acme"),
  agentNames: new Map([
    [agentAda, "Ada"],
    [agentBo, "Bo"],
  ]),
  userId: me,
};
const createdAt = "2026-11-27T09:30:00.000Z";

/** The IDs of `item`'s options that decline. */
function declining(item: InboxItem | undefined): string[] {
  return (item?.options ?? []).flatMap((option) => (option.declines === true ? [option.id] : []));
}

function approval(type: string): InboxItem | undefined {
  const record = { id: "a0000000-0000-4000-8000-000000000001", type, status: "pending", createdAt };
  return approvalToItem(
    context,
    { ...record, requestedByAgentId: agentAda, payload: {} },
    undefined,
  );
}

verifies("paperclip-client.declining-options", () => {
  describe("options that turn an item down", () => {
    it("marks an approval's Reject and Request changes, never its Approve", () => {
      for (const type of ["hire_agent", "budget_override_required", "approve_ceo_strategy"]) {
        expect(declining(approval(type)), type).toEqual(["reject", "request-changes"]);
      }
    });

    it("marks a confirmation card's Reject, never its Accept", () => {
      const card = {
        id: "c0000000-0000-4000-8000-000000000001",
        kind: "request_confirmation",
        status: "pending",
        createdByAgentId: agentAda,
        payload: { version: 1, prompt: "Run acme-deploy?", acceptLabel: "reject" },
        createdAt,
      };
      const item = cardToItem(context, "t0000000-0000-4000-8000-000000000001", card);
      expect(declining(item)).toEqual(["reject"]);
    });

    it("marks a join request's and a secret proposal's Reject only", () => {
      const join = joinRequestToItem(context, {
        id: "10000000-0000-4000-8000-000000000002",
        requestType: "agent",
        status: "pending_approval",
        agentName: "Cy",
        createdAt,
      });
      const proposal = secretProposalToItem(context, {
        id: "5e000000-0000-4000-8000-000000000001",
        status: "pending",
        proposedByAgentId: agentAda,
        kind: "secret",
        proposedName: "Acme deploy token",
        createdAt,
      });
      expect(declining(join)).toEqual(["reject"]);
      expect(declining(proposal)).toEqual(["reject"]);
    });

    it("never marks a decision's option, even one the agent named reject", () => {
      const item = decisionToItem(context, {
        id: "d0000000-0000-4000-8000-000000000001",
        status: "open",
        title: "Clean up?",
        options: [
          { id: "reject", label: "Cancel the tree", style: "destructive", effects: [] },
          { id: "request-changes", label: "Keep it", effects: [] },
        ],
        createdAt,
      });
      expect(item?.risk).toBe("risky");
      expect(item?.options.map((option) => option.id)).toEqual(["reject", "request-changes"]);
      expect(declining(item)).toEqual([]);
    });
  });
});
