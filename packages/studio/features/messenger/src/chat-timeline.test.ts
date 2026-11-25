import type { InboxItem, Message } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { cardRecord, chatTimeline, waitingCards } from "./chat-timeline.ts";
import { messengerWords } from "./messenger-words.ts";

/** A local time on 25 Nov 2026, as ISO text. */
function at(hours: number, minutes = 0): string {
  return new Date(2026, 10, 25, hours, minutes).toISOString();
}

function message(id: string, sentAt: string): Message {
  return {
    id,
    conversation: "chat",
    author: { kind: "agent", agent: "chief", name: "Chief" },
    body: id,
    attachments: [],
    sentAt,
  };
}

function card(
  id: string,
  createdAt: string,
  state: InboxItem["state"] = { kind: "open" },
): InboxItem {
  return {
    id,
    source: "acme",
    from: { kind: "agent", agent: "chief", name: "Chief" },
    question: `${id}?`,
    options: [
      { id: "approve", label: "Approve" },
      { id: "reject", label: "Reject" },
    ],
    attachments: [],
    createdAt,
    state,
  };
}

const me = { kind: "me" } as const;

verifies("messenger.inline-cards", () => {
  describe("chatTimeline", () => {
    it("puts each card where it was made among the messages, open or answered", () => {
      const answered = card("ship", at(10, 30), {
        kind: "answered",
        by: me,
        answer: { kind: "option", option: "approve" },
        answeredAt: at(12, 10),
      });
      const entries = chatTimeline(
        [message("morning", at(9)), message("done", at(11))],
        [card("merge", at(10)), answered],
      );
      expect(
        entries.map((entry) => (entry.kind === "message" ? entry.message.id : entry.card.id)),
      ).toEqual(["morning", "merge", "ship", "done"]);
    });

    it("keeps a message before a card made at the same time", () => {
      const entries = chatTimeline([message("morning", at(9))], [card("merge", at(9))]);
      expect(entries.map((entry) => entry.kind)).toEqual(["message", "card"]);
    });
  });

  describe("waitingCards", () => {
    it("gives the open cards only, oldest first", () => {
      const answered = card("ship", at(8), {
        kind: "answered",
        by: me,
        answer: { kind: "reply", text: "ok" },
        answeredAt: at(9),
      });
      const waiting = waitingCards([card("late", at(11)), answered, card("early", at(10))]);
      expect(waiting.map((each) => each.id)).toEqual(["early", "late"]);
    });
  });

  describe("the bar's words", () => {
    it("says how many cards wait, with one card in the singular", () => {
      expect(messengerWords.cardsWaiting(50)).toBe("50 cards waiting");
      expect(messengerWords.cardsWaiting(2)).toBe("2 cards waiting");
      expect(messengerWords.cardsWaiting(1)).toBe("1 card waiting");
    });
  });

  describe("cardRecord", () => {
    it("says an answered card's choice and time, and nothing for an open card", () => {
      const answeredAt = at(12, 10);
      const answer = (answer: Extract<InboxItem["state"], { kind: "answered" }>["answer"]) =>
        cardRecord(card("merge", at(10), { kind: "answered", by: me, answer, answeredAt }));
      expect(answer({ kind: "option", option: "approve" })).toBe("Approve, 12:10");
      expect(answer({ kind: "reply", text: "Not yet" })).toBe("“Not yet”, 12:10");
      expect(cardRecord(card("merge", at(10)))).toBeUndefined();
    });
  });
});
