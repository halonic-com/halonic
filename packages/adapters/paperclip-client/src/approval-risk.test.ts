import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  agentAda,
  company,
  confirmCard,
  plainTask,
  questionCard,
} from "./acme-data.test-helper.ts";
import {
  cardId as card,
  connect,
  FakePaperclip,
  sourceId as source,
} from "./fake-paperclip.test-helper.ts";

/** A pending Acme approval of `type`, asked by Ada; no type at all when `type` is undefined. */
function approval(id: string, type: string | undefined, title = "Please decide") {
  return {
    id,
    ...(type === undefined ? {} : { type }),
    status: "pending",
    requestedByAgentId: agentAda,
    payload: { title },
    createdAt: "2026-11-24T09:30:00.000Z",
  };
}

/** The risk of each inbox item, by its id, with Acme serving `approvals`. */
async function risksWith(approvals: ReturnType<typeof approval>[]): Promise<Map<string, string>> {
  const paperclip = new FakePaperclip()
    .serveAcme()
    .on("GET", `/api/companies/${company}/approvals`, { body: approvals });
  for (const { id } of approvals) {
    paperclip.on("GET", `/api/approvals/${id}/issues`, { body: [] });
  }
  const items = await connect(paperclip, { offline: false }).listInboxItems();
  return new Map(items.map((item) => [item.id, item.risk ?? "absent"]));
}

const approvalItem = (id: string): string => `${source}:approval:${id}`;

verifies("paperclip-client.approval-risk", () => {
  describe("approval risk", () => {
    it.each([
      ["hiring", "hire_agent"],
      ["budget", "budget_override_required"],
      ["CEO strategy", "approve_ceo_strategy"],
    ])("marks a %s approval risky", async (_name, type) => {
      const risks = await risksWith([approval("p-1", type)]);
      expect(risks.get(approvalItem("p-1"))).toBe("risky");
    });

    it("marks a plain board approval normal", async () => {
      const risks = await risksWith([approval("p-1", "request_board_approval")]);
      expect(risks.get(approvalItem("p-1"))).toBe("normal");
    });

    it("fails closed: a permission approval of a type it doesn't know, or none, is risky", async () => {
      const risks = await risksWith([
        approval("p-1", "grant_agent_permissions"),
        approval("p-2", undefined),
      ]);
      expect([risks.get(approvalItem("p-1")), risks.get(approvalItem("p-2"))]).toEqual([
        "risky",
        "risky",
      ]);
    });

    it("takes the risk from Paperclip's type, never from the asking agent's title", async () => {
      const risks = await risksWith([approval("p-1", "hire_agent", "Just a typo, nothing risky")]);
      expect(risks.get(approvalItem("p-1"))).toBe("risky");
    });

    it("marks questions and confirmations normal", async () => {
      const risks = await risksWith([]);
      expect([
        risks.get(card(plainTask, confirmCard)),
        risks.get(card(plainTask, questionCard)),
      ]).toEqual(["normal", "normal"]);
    });
  });
});
