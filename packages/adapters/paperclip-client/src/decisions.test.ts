import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeData, agentAda, me, plainTask } from "./acme-data.test-helper.ts";
import { connect, FakePaperclip, sourceId as source } from "./fake-paperclip.test-helper.ts";

const decisionId = "d0000000-0000-4000-8000-000000000001";
const decisionItem = `${source}:decision:${decisionId}`;

/** An Acme decision, asked by Ada from the plain task, with two options. */
function decision(extra: object = {}) {
  return {
    id: decisionId,
    status: "open",
    originAgentId: agentAda,
    originIssueId: plainTask,
    title: "Which launch day?",
    body: "The post is ready.",
    options: [
      { id: "friday", label: "Friday", style: "primary", effects: [] },
      { id: "monday", label: "Monday", effects: [] },
    ],
    inputs: null,
    createdAt: "2026-11-24T09:45:00.000Z",
    ...extra,
  };
}

/** Acme serving `decisions`, each listed under its own status. */
function acmeWith(decisions: ReturnType<typeof decision>[]): FakePaperclip {
  const data = acmeData();
  data.decisions = decisions;
  return new FakePaperclip().serveAcme(data);
}

const posts = (paperclip: FakePaperclip) =>
  paperclip.seen.filter((request) => request.method === "POST");

verifies("paperclip-client.decisions", () => {
  describe("standalone decisions", () => {
    it("lists an open decision with its options as buttons, from its task", async () => {
      const paperclip = acmeWith([decision()]);
      const items = await connect(paperclip, { offline: false }).listInboxItems();
      const item = items.find((each) => each.id === decisionItem);
      expect(item?.question).toBe("Which launch day?\n\nThe post is ready.");
      expect(item?.options).toEqual([
        { id: "friday", label: "Friday" },
        { id: "monday", label: "Monday" },
      ]);
      expect(item?.work).toBe(`${source}:task:${plainTask}`);
      expect(item?.risk).toBe("normal");
      const read = paperclip.seen.find((request) => request.path.endsWith("/decisions"));
      expect(read?.query.get("status")).toBe("open");
    });

    it("sends the picked option to decide, with an idempotency key", async () => {
      const paperclip = acmeWith([decision()]).on("POST", `/api/decisions/${decisionId}/decide`, {
        body: {},
      });
      const result = await connect(paperclip, { offline: false }).answer(decisionItem, {
        kind: "option",
        option: "monday",
      });
      expect(result.outcome).toBe("answered");
      expect(posts(paperclip).map((request) => request.body)).toEqual([
        { optionId: "monday", idempotencyKey: `halonic:${decisionId}:monday` },
      ]);
    });

    it("refuses an option it doesn't offer, or a decision that needs a written value, sending nothing", async () => {
      const required = [{ id: "reason", label: "Why?", required: true }];
      for (const [record, option] of [
        [decision(), "sunday"],
        [decision({ inputs: required }), "friday"],
      ] as const) {
        const paperclip = acmeWith([record]);
        await expect(
          connect(paperclip, { offline: false }).answer(decisionItem, { kind: "option", option }),
        ).rejects.toThrow("answer it in Paperclip");
        expect(posts(paperclip)).toEqual([]);
      }
    });

    it("says who decided it when it was already decided", async () => {
      const decided = decision({
        status: "decided",
        chosenOptionId: "friday",
        decidedByUserId: me,
        decidedAt: "2026-11-24T09:50:00.000Z",
      });
      const paperclip = acmeWith([decided]);
      const result = await connect(paperclip, { offline: false }).answer(decisionItem, {
        kind: "option",
        option: "monday",
      });
      expect(result).toEqual({
        outcome: "already-answered",
        by: { kind: "me" },
        answeredAt: "2026-11-24T09:50:00.000Z",
      });
      expect(posts(paperclip)).toEqual([]);
    });

    it("marks a decision with a destructive option risky", async () => {
      const options = [
        { id: "cancel", label: "Cancel the tree", style: "destructive", effects: [] },
      ];
      const items = await connect(acmeWith([decision({ options })]), {
        offline: false,
      }).listInboxItems();
      expect(items.find((each) => each.id === decisionItem)?.risk).toBe("risky");
    });
  });
});
