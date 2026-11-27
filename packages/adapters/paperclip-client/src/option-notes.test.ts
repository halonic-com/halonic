import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { acmeData, agentAda, company, confirmCard, plainTask } from "./acme-data.test-helper.ts";
import {
  cardId as card,
  connect,
  FakePaperclip,
  sourceId as source,
} from "./fake-paperclip.test-helper.ts";

/** A pending Acme confirmation on the plain task with `payload`, asked by Ada. */
function confirmation(payload: object) {
  return {
    id: confirmCard,
    kind: "request_confirmation",
    status: "pending",
    createdByAgentId: agentAda,
    payload: { version: 1, prompt: "Go ahead?", ...payload },
    createdAt: "2026-11-24T10:00:00.000Z",
  };
}

/** Acme serving one pending hire approval and `cards` on the plain task. */
function acmeWith(cards: object[]): FakePaperclip {
  const data = acmeData();
  data.cards = cards as typeof data.cards;
  const approval = {
    id: "p-1",
    type: "hire_agent",
    status: "pending",
    requestedByAgentId: agentAda,
    payload: { name: "Iris" },
    createdAt: "2026-11-24T09:30:00.000Z",
  };
  return new FakePaperclip()
    .serveAcme(data)
    .on("GET", `/api/companies/${company}/approvals`, { body: [approval] })
    .on("GET", "/api/approvals/p-1/issues", { body: [] });
}

async function itemsOf(paperclip: FakePaperclip) {
  const items = await connect(paperclip, { offline: false }).listInboxItems();
  return new Map(items.map((item) => [item.id, item]));
}

verifies("paperclip-client.option-notes", () => {
  it("gives Request changes on an approval a required note, and Approve and Reject none", async () => {
    const items = await itemsOf(acmeWith([]));
    expect(items.get(`${source}:approval:p-1`)?.options).toEqual([
      { id: "approve", label: "Approve" },
      { id: "reject", label: "Reject", declines: true },
      {
        id: "request-changes",
        label: "Request changes",
        declines: true,
        noteRequired: true,
        noteLabel: "What should change?",
      },
    ]);
  });

  it("gives Reject a required note labelled rejectReasonLabel when the card requires a reason", async () => {
    const labelled = await itemsOf(
      acmeWith([confirmation({ rejectRequiresReason: true, rejectReasonLabel: "Why not now?" })]),
    );
    const unlabelled = await itemsOf(acmeWith([confirmation({ rejectRequiresReason: true })]));
    const plain = await itemsOf(acmeWith([confirmation({ rejectReasonLabel: "Why not now?" })]));
    const confirmItem = card(plainTask, confirmCard);
    expect(labelled.get(confirmItem)?.options).toEqual([
      { id: "accept", label: "Accept" },
      {
        id: "reject",
        label: "Reject",
        declines: true,
        noteRequired: true,
        noteLabel: "Why not now?",
      },
    ]);
    expect(unlabelled.get(confirmItem)?.options[1]).toEqual({
      id: "reject",
      label: "Reject",
      declines: true,
      noteRequired: true,
      noteLabel: "Why are you rejecting this?",
    });
    expect(plain.get(confirmItem)?.options[1]).toEqual({
      id: "reject",
      label: "Reject",
      declines: true,
    });
  });

  it("keeps a document label with a newline and ] on one line, escaped in its link", async () => {
    const target = {
      type: "issue_document",
      key: "plan",
      label: "Plan\n] (https://evil.example) [x",
      revisionNumber: 3,
      href: "https://paperclip.acme.example/plan",
    };
    const items = await itemsOf(acmeWith([confirmation({ target })]));
    expect(items.get(card(plainTask, confirmCard))?.question).toBe(
      "Go ahead?\n\nDocument: [Plan \\] (https://evil.example) \\[x, revision 3](https://paperclip.acme.example/plan)",
    );
  });
});
