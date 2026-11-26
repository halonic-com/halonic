import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { agentAda, company } from "./acme-data.test-helper.ts";
import { newLimitCents } from "./budget-amount.ts";
import { connect, FakePaperclip, sourceId as source } from "./fake-paperclip.test-helper.ts";
import { fitsBody } from "./requests.ts";

const approval = "p0000000-0000-4000-8000-000000000009";
const incident = "b0000000-0000-4000-8000-000000000001";
const item = `${source}:approval:${approval}`;
const resolvePath = `/api/companies/${company}/budget-incidents/${incident}/resolve`;

/** Acme's Website project stopped at its $100.00 limit after $125.50, waiting on the board. */
function overrideRecord(status: string) {
  return {
    id: approval,
    type: "budget_override_required",
    status,
    requestedByAgentId: agentAda,
    payload: { scopeName: "Website", budgetAmount: 10000, observedAmount: 12550 },
    decidedByUserId: status === "pending" ? null : "u-other",
    decidedAt: status === "pending" ? null : "2026-11-24T10:00:00.000Z",
    createdAt: "2026-11-24T09:30:00.000Z",
  };
}

/** Acme serving that override, its budget stop and the stop's resolve route. */
function acmeOverBudget(status = "pending"): FakePaperclip {
  const overview = {
    companyId: company,
    policies: [],
    activeIncidents: [
      { id: incident, approvalId: approval, scopeName: "Website", amountObserved: 12550 },
    ],
  };
  return new FakePaperclip()
    .on("GET", `/api/approvals/${approval}`, { body: overrideRecord(status) })
    .on("GET", `/api/companies/${company}/budgets/overview`, { body: overview })
    .on("POST", resolvePath, { body: { id: incident, resolvedAt: "2026-11-24T10:05:00.000Z" } });
}

function answerWith(paperclip: FakePaperclip, option: string, note?: string) {
  const answer = note === undefined ? { kind: "option", option } : { kind: "option", option, note };
  return connect(paperclip, { offline: false }).answer(item, answer as never);
}

const posts = (paperclip: FakePaperclip) =>
  paperclip.seen.filter((request) => request.method === "POST");

verifies("paperclip-client.budget-incidents", () => {
  describe("answering a budget override", () => {
    it("approves by raising the limit to the written amount and resuming", async () => {
      const paperclip = acmeOverBudget();
      expect(await answerWith(paperclip, "approve", "$250.50")).toEqual({
        outcome: "answered",
        answeredAt: "2026-11-24T10:05:00.000Z",
      });
      expect(posts(paperclip)).toMatchObject([
        { path: resolvePath, body: { action: "raise_budget_and_resume", amount: 25050 } },
      ]);
    });

    it("rejects by keeping the work paused", async () => {
      const paperclip = acmeOverBudget();
      expect(await answerWith(paperclip, "reject")).toMatchObject({ outcome: "answered" });
      expect(posts(paperclip)).toMatchObject([
        { path: resolvePath, body: { action: "keep_paused" } },
      ]);
    });

    it("asks for the new limit on Approve, and keeps Reject and Request changes", async () => {
      const paperclip = new FakePaperclip()
        .serveAcme()
        .on("GET", `/api/companies/${company}/approvals`, { body: [overrideRecord("pending")] })
        .on("GET", `/api/approvals/${approval}/issues`, { body: [] });
      const items = await connect(paperclip, { offline: false }).listInboxItems();
      expect(items.find((listed) => listed.id === item)?.options).toEqual([
        { id: "approve", label: "Approve", noteRequired: true, noteLabel: "New limit, in dollars" },
        { id: "reject", label: "Reject" },
        {
          id: "request-changes",
          label: "Request changes",
          noteRequired: true,
          noteLabel: "What should change?",
        },
      ]);
    });

    it("sends nothing for an amount it can't read or one not above the spend", async () => {
      const paperclip = acmeOverBudget();
      // `denied`, so the Inbox card shows the sentence itself.
      await expect(answerWith(paperclip, "approve", "a lot")).rejects.toMatchObject({
        kind: "denied",
        message: "Enter the new limit in dollars, such as 250 or 250.50.",
      });
      await expect(answerWith(paperclip, "approve", "125.50")).rejects.toThrow(
        "The new limit must be more than the $125.50 already spent.",
      );
      expect(posts(paperclip)).toEqual([]);
    });

    it("says already-answered for a decided override, and sends nothing", async () => {
      const paperclip = acmeOverBudget("approved");
      expect(await answerWith(paperclip, "approve", "300")).toMatchObject({
        outcome: "already-answered",
        answeredAt: "2026-11-24T10:00:00.000Z",
      });
      expect(posts(paperclip)).toEqual([]);
    });

    it("refuses when Paperclip has no budget stop open for the approval", async () => {
      const paperclip = acmeOverBudget().on("GET", `/api/companies/${company}/budgets/overview`, {
        body: { activeIncidents: [] },
      });
      await expect(answerWith(paperclip, "reject")).rejects.toThrow(
        "Paperclip has no budget stop open for this approval. Check it in Paperclip.",
      );
      expect(posts(paperclip)).toEqual([]);
    });

    it("passes on Paperclip's reason when it refuses the new limit", async () => {
      const paperclip = acmeOverBudget().on("POST", resolvePath, {
        status: 422,
        body: { error: "New budget must exceed current observed spend" },
      });
      await expect(answerWith(paperclip, "approve", "300")).rejects.toThrow(
        "Paperclip didn't change the budget: New budget must exceed current observed spend",
      );
    });
  });

  describe("the new limit and the resolve rows", () => {
    it("reads dollars into cents, and refuses anything else", () => {
      expect(newLimitCents("250")).toBe(25000);
      expect(newLimitCents(" $1,250.5 ")).toBe(125050);
      for (const written of ["", "0", "-5", "250,50", "1.234", "25000000", "1e3", undefined]) {
        expect(newLimitCents(written)).toBeUndefined();
      }
    });

    it("pins each row's action, and the amount to a whole number of cents", () => {
      expect(fitsBody("raiseBudget", { action: "raise_budget_and_resume", amount: 25050 })).toBe(
        true,
      );
      expect(fitsBody("raiseBudget", { action: "keep_paused", amount: 25050 })).toBe(false);
      expect(fitsBody("raiseBudget", { action: "raise_budget_and_resume", amount: 250.5 })).toBe(
        false,
      );
      expect(fitsBody("raiseBudget", { action: "raise_budget_and_resume", amount: "25050" })).toBe(
        false,
      );
      expect(
        fitsBody("raiseBudget", {
          action: "raise_budget_and_resume",
          amount: 25050,
          decisionNote: "x",
        }),
      ).toBe(false);
      expect(fitsBody("keepBudgetPaused", { action: "keep_paused" })).toBe(true);
      expect(fitsBody("keepBudgetPaused", { action: "keep_paused", amount: 1 })).toBe(false);
    });
  });
});
