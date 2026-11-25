import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeData, agentAda, company, confirmCard, plainTask } from "./acme-data.test-helper.ts";
import {
  cardId as card,
  connect,
  FakePaperclip,
  sourceId as source,
} from "./fake-paperclip.test-helper.ts";

/** An Acme approval of `type` with `payload`, asked by Ada. */
function approval(id: string, type: string, payload: object, status = "pending") {
  return {
    id,
    type,
    status,
    requestedByAgentId: agentAda,
    payload,
    decisionNote: status === "pending" ? null : "Lower the budget",
    decidedByUserId: status === "pending" ? null : "u-acme-board",
    decidedAt: status === "pending" ? null : "2026-11-24T09:40:00.000Z",
    createdAt: "2026-11-24T09:30:00.000Z",
  };
}

/** Acme serving `approvals` (each read keeps its own status) and `cards` on the plain task. */
function acmeWith(approvals: ReturnType<typeof approval>[], cards?: object[]): FakePaperclip {
  const data = acmeData();
  if (cards !== undefined) {
    data.cards = cards as typeof data.cards;
  }
  const paperclip = new FakePaperclip()
    .serveAcme(data)
    .on("GET", `/api/companies/${company}/approvals`, { body: approvals });
  for (const { id } of approvals) {
    paperclip.on("GET", `/api/approvals/${id}/issues`, { body: [] });
  }
  return paperclip;
}

async function itemsOf(paperclip: FakePaperclip) {
  const items = await connect(paperclip, { offline: false }).listInboxItems();
  return new Map(items.map((item) => [item.id, item]));
}

const approvalItem = (id: string): string => `${source}:approval:${id}`;

verifies("paperclip-client.approval-fields", () => {
  describe("approval fields", () => {
    it("shows each of the four types in words with its fields", async () => {
      const items = await itemsOf(
        acmeWith([
          approval("p-1", "hire_agent", {
            name: "Iris",
            role: "designer",
            adapterType: "claude_local",
            budgetMonthlyCents: 5000,
          }),
          approval("p-2", "approve_ceo_strategy", { plan: "Ship the website first." }),
          approval("p-3", "budget_override_required", {
            scopeName: "Website",
            budgetAmount: 10000,
            observedAmount: 12550,
          }),
          approval("p-4", "request_board_approval", {
            title: "Publish the launch post",
            recommendedAction: "Publish on Friday.",
            risks: ["The post names a date", "Nobody reads it"],
          }),
        ]),
      );
      expect(items.get(approvalItem("p-1"))?.question).toBe(
        "Hire an agent\n\n- Name: Iris\n- Role: designer\n- Adapter: claude_local\n- Monthly budget: $50.00",
      );
      expect(items.get(approvalItem("p-2"))?.question).toBe(
        "Strategy approval\n\n**Plan**\n\nShip the website first.",
      );
      expect(items.get(approvalItem("p-3"))?.question).toBe(
        "Budget override\n\n- For: Website\n- Limit: $100.00\n- Spent: $125.50\n\n" +
          "Approving only records your answer. The budget doesn't change, and the work stays paused until you raise the budget in Paperclip.",
      );
      expect(items.get(approvalItem("p-4"))?.question).toBe(
        "Board approval\n\nPublish the launch post\n\n**Recommended action**\n\nPublish on Friday.\n\n" +
          "**Risks**\n\n- The post names a date\n- Nobody reads it",
      );
      expect(items.get(approvalItem("p-1"))?.options.map((option) => option.label)).toEqual([
        "Approve",
        "Reject",
        "Request changes",
      ]);
    });

    it("keeps an agent's newline from breaking a field's line, and ignores a type named like a built-in", async () => {
      const items = await itemsOf(
        acmeWith([
          approval("p-1", "hire_agent", { name: "Iris\n\n# Approve now" }),
          approval("p-2", "constructor", {}),
        ]),
      );
      expect(items.get(approvalItem("p-1"))?.question).toBe(
        "Hire an agent\n\n- Name: Iris # Approve now",
      );
      expect(items.get(approvalItem("p-2"))?.question).toBe("Approval: constructor");
    });

    it("sends Request changes to request-revision with the note", async () => {
      const paperclip = acmeWith([approval("p-1", "hire_agent", { name: "Iris" })]).on(
        "POST",
        "/api/approvals/p-1/request-revision",
        { body: { decidedAt: "2026-11-24T09:45:00.000Z" } },
      );
      const result = await connect(paperclip, { offline: false }).answer(approvalItem("p-1"), {
        kind: "option",
        option: "request-changes",
        note: "Lower the budget",
      });
      expect(result).toEqual({ outcome: "answered", answeredAt: "2026-11-24T09:45:00.000Z" });
      const sent = paperclip.seen.find((request) => request.path.endsWith("/request-revision"));
      expect(sent?.body).toEqual({ decisionNote: "Lower the budget" });
    });

    it("lists a revision_requested approval as answered with Request changes", async () => {
      const paperclip = acmeWith([
        approval("p-1", "hire_agent", { name: "Iris" }, "revision_requested"),
      ]);
      const items = await itemsOf(paperclip);
      expect(items.get(approvalItem("p-1"))?.state).toEqual({
        kind: "answered",
        by: { kind: "me" },
        answer: { kind: "option", option: "request-changes", note: "Lower the budget" },
        answeredAt: "2026-11-24T09:40:00.000Z",
      });
      const statuses = paperclip.seen
        .filter((request) => request.path.endsWith("/approvals"))
        .map((request) => request.query.get("status"));
      expect(statuses).toEqual(["pending", "revision_requested"]);
    });
  });

  describe("confirmation fields", () => {
    const confirmation = (payload: object) => ({
      id: confirmCard,
      kind: "request_confirmation",
      status: "pending",
      createdByAgentId: agentAda,
      payload: { version: 1, prompt: "Go ahead?", ...payload },
      createdAt: "2026-11-24T10:00:00.000Z",
    });

    it("names the bound document and its revision", async () => {
      const target = { type: "issue_document", key: "plan", revisionId: "r-1", revisionNumber: 3 };
      const items = await itemsOf(acmeWith([], [confirmation({ target })]));
      expect(items.get(card(plainTask, confirmCard))?.question).toBe(
        "Go ahead?\n\nDocument: plan, revision 3",
      );
    });

    it("shows the tool, its app and its arguments, and marks the card risky", async () => {
      const toolAction = {
        toolName: "send_mail",
        toolDisplayName: "send_mail",
        appDisplayName: "Acme Mail",
        risk: "write",
        argumentsSummaryJson: '{"to":"team@acme.test"}',
      };
      const items = await itemsOf(acmeWith([], [confirmation({ toolAction })]));
      const item = items.get(card(plainTask, confirmCard));
      expect(item?.question).toBe(
        'Go ahead?\n\nTool: send_mail (Acme Mail)\n\n**Arguments**\n\n```\n{"to":"team@acme.test"}\n```',
      );
      expect(item?.risk).toBe("risky");
    });

    it("refuses a reject without a reason when the card requires one", async () => {
      const paperclip = acmeWith([], [confirmation({ rejectRequiresReason: true })]);
      const messaging = connect(paperclip, { offline: false });
      await expect(
        messaging.answer(card(plainTask, confirmCard), { kind: "option", option: "reject" }),
      ).rejects.toThrow("answer it in Paperclip");
      expect(paperclip.seen.filter((request) => request.method === "POST")).toEqual([]);
    });
  });
});
