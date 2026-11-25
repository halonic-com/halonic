import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { answerFitsItem, type InboxAnswer, type InboxItem, inboxItemFits } from "./index.ts";

const elsewhere: InboxItem = {
  id: "acme:item:7",
  source: "acme",
  from: { kind: "agent", agent: "acme:ada", name: "Ada" },
  question: "Pick the launch date",
  options: [],
  answerElsewhere: { link: "https://acme.example/ACME/issues/ACME-7" },
  attachments: [],
  createdAt: "2026-11-25T10:00:00Z",
  state: { kind: "open" },
};

verifies("ports.agent-messaging-answer-elsewhere", () => {
  it("takes no answer for an item answered elsewhere", () => {
    const tries: InboxAnswer[] = [
      { kind: "reply", text: "Tomorrow" },
      { kind: "option", option: "tomorrow" },
      { kind: "answers", answers: [] },
    ];
    for (const answer of tries) {
      expect(answerFitsItem(elsewhere, answer)).toBe(false);
    }
    const { answerElsewhere: _link, ...here } = elsewhere;
    expect(answerFitsItem(here, { kind: "reply", text: "Tomorrow" })).toBe(true);
  });

  it("holds only an https link", () => {
    const linked = (link: string): InboxItem => ({ ...elsewhere, answerElsewhere: { link } });

    expect(inboxItemFits(elsewhere)).toBe(true);
    expect(inboxItemFits(linked("http://acme.example/ACME/issues/ACME-7"))).toBe(false);
    expect(inboxItemFits(linked("javascript:alert(1)"))).toBe(false);
    expect(inboxItemFits(linked("/ACME/issues/ACME-7"))).toBe(false);
    expect(inboxItemFits(linked("https://board@acme.example/ACME-7"))).toBe(false);
  });
});
