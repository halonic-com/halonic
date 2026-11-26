import { type InboxItem, inboxItemFits } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  agentAda,
  agentBo,
  approvalId,
  confirmCard,
  plainTask,
  questionCard,
} from "./acme-data.test-helper.ts";
import { joinRequestToItem, secretProposalToItem } from "./board-request-items.ts";
import { approvalToItem, cardToItem } from "./cards.ts";
import { decisionToItem } from "./decisions.ts";
import { cardId, FakePaperclip, sourceId as source } from "./fake-paperclip.test-helper.ts";
import { PaperclipIds } from "./ids.ts";
import type { MapContext } from "./map.ts";
import { connectWithSteppers, serveStepper, stepperCard } from "./stepper-fixtures.test-helper.ts";

const context: MapContext = {
  ids: new PaperclipIds("acme"),
  agentNames: new Map(),
  origin: "https://paperclip.acme.test",
};
const createdAt = "2026-11-26T09:00:00.000Z";

/** An invented pending Acme card of `kind`, asked by Bo. */
function card(kind: string, payload: object = {}) {
  return {
    id: `f-${kind}`,
    kind,
    status: "pending",
    createdByAgentId: agentBo,
    title: "Start the docs work",
    payload: { version: 1, prompt: "Ready to go on?", ...payload },
    createdAt,
  };
}

const cardKinds: readonly [string, object, InboxItem["kind"]][] = [
  ["request_confirmation", {}, "approval"],
  ["request_item_verdicts", { items: [{ id: "intro", label: "Intro page" }] }, "approval"],
  [
    "ask_user_questions",
    { questions: [{ id: "q1", prompt: "Which colour?", options: [{ id: "red", label: "Red" }] }] },
    "question",
  ],
  ["request_checkbox_confirmation", { options: [{ id: "draft", label: "Old draft" }] }, "question"],
  ["suggest_tasks", { tasks: [{ clientKey: "write", title: "Write the guide" }] }, "question"],
  ["connection_intent", {}, "elsewhere"],
];

/** The items Paperclip's other records map to, one of each. */
function otherItems(): Record<
  "approval" | "decision" | "secretProposal" | "joinRequest",
  InboxItem | undefined
> {
  return {
    approval: approvalToItem(
      context,
      { id: approvalId, type: "hire_agent", status: "pending", requestedByAgentId: agentAda },
      undefined,
    ),
    decision: decisionToItem(context, {
      id: "d-launch",
      status: "open",
      originAgentId: agentAda,
      title: "Which launch day?",
      options: [{ id: "friday", label: "Friday" }],
      createdAt,
    }),
    secretProposal: secretProposalToItem(context, {
      id: "s-deploy",
      kind: "secret",
      status: "pending",
      proposedName: "Acme deploy token",
      proposedByAgentId: agentAda,
      createdAt,
    }),
    joinRequest: joinRequestToItem(context, {
      id: "j-sam",
      requestType: "human",
      status: "pending_approval",
      requestingUserId: "u-acme-sam",
      createdAt,
    }),
  };
}

verifies("paperclip-client.item-kinds", () => {
  describe("the kind of each Paperclip item", () => {
    it.each(cardKinds)(
      "gives a %s card its kind, and the item holds together",
      (kind, payload, expected) => {
        const item = cardToItem(context, plainTask, card(kind, payload));
        expect(item?.kind).toBe(expected);
        expect(item !== undefined && inboxItemFits(item)).toBe(true);
      },
    );

    it("gives a card of a kind it doesn't know no kind", () => {
      expect(cardToItem(context, plainTask, card("brand_new_kind"))?.kind).toBeUndefined();
    });

    it("makes approvals, secret proposals and join requests approvals, and decisions questions", () => {
      const items = otherItems();
      expect(items.approval?.kind).toBe("approval");
      expect(items.secretProposal?.kind).toBe("approval");
      expect(items.joinRequest?.kind).toBe("approval");
      expect(items.decision?.kind).toBe("question");
      for (const item of Object.values(items)) {
        expect(item !== undefined && inboxItemFits(item)).toBe(true);
      }
    });
  });

  describe("a card that pins a stepper", () => {
    it("is an action, and every listed item holds together", async () => {
      const paperclip = serveStepper(new FakePaperclip());
      const items = await connectWithSteppers(paperclip, { offline: false }).listInboxItems();
      const kinds = new Map(items.map((item) => [item.id, item.kind]));

      expect(kinds.get(cardId(plainTask, stepperCard))).toBe("action");
      expect(kinds.get(cardId(plainTask, confirmCard))).toBe("approval");
      expect(kinds.get(cardId(plainTask, questionCard))).toBe("question");
      expect(kinds.get(`${source}:approval:${approvalId}`)).toBe("approval");
      expect(items.filter((item) => !inboxItemFits(item))).toEqual([]);
    });
  });
});
