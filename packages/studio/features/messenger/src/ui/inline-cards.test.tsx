// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { byText, openChat, openMessenger, press } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

/** The elements `scrollIntoView` was called on, newest last; jsdom has no scrolling of its own. */
let scrolled: Element[] = [];

beforeEach(() => {
  scrolled = [];
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled.push(this);
  };
});

afterEach(() => {
  unmountAll();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

/**
 * Acme's Chief with a chat: "Morning" at 9:00, then `cards` open cards a minute apart from 10:00,
 * then "Done" after them. The clock is set by hand, so each test says when an answer lands.
 */
function chiefWithCards(cards: number) {
  const clock = { now: new Date(2026, 10, 25, 9, 0) };
  const messaging = new FakeAgentMessaging({ now: () => clock.now });
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(acme.id, { name: "Chief" });
  const chat = messaging.addConversation(chief.id);
  messaging.addMessage(chat.id, { body: "Morning" });
  for (let index = 0; index < cards; index += 1) {
    clock.now = new Date(2026, 10, 25, 10, index);
    messaging.addInboxItem(acme.id, {
      question: `Merge #${index + 1}?`,
      from: { kind: "agent", agent: chief.id, name: "Chief" },
      options: [
        { id: "approve", label: "Approve" },
        { id: "reject", label: "Reject" },
      ],
    });
  }
  clock.now = new Date(2026, 10, 25, 11, 30);
  messaging.addMessage(chat.id, { body: "Done" });
  return { messaging, clock };
}

/** The timeline's entries in order, as text: a message, an open card, or an answered card's record. */
/** The timeline's entries, without the day's label before them. */
function timeline(page: HTMLElement): string[] {
  return [...page.querySelectorAll("main ol > li:not([data-day])")].map(
    (entry) => entry.textContent ?? "",
  );
}

/** The bar's count, without its Next. */
function bar(page: HTMLElement): string | undefined {
  return page.querySelector("[data-cards-bar] button")?.textContent ?? undefined;
}

verifies("messenger.inline-cards", () => {
  describe("cards in the chat's timeline", () => {
    it("shows each card where it was made among the messages, and no card after them", async () => {
      const { messaging } = chiefWithCards(2);
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      const entries = timeline(page);
      expect(entries).toHaveLength(4);
      expect(entries[0]).toContain("Morning");
      expect(entries[1]).toContain("Merge #1?");
      expect(entries[2]).toContain("Merge #2?");
      expect(entries[3]).toContain("Done");
    });

    it("with 50 open cards, opens at the latest message and says 50 cards waiting under it", async () => {
      const { messaging } = chiefWithCards(50);
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      const last = page.querySelector("main ol > li:last-child");
      expect(last?.textContent).toContain("Done");
      expect(scrolled).toEqual([last]);
      expect(bar(page)).toBe("50 cards waiting");
      // The bar is under the messages, above the box.
      const order = [...page.querySelectorAll("main ol, [data-cards-bar], main textarea")];
      expect(order.map((each) => each.tagName)).toEqual(["OL", "DIV", "TEXTAREA"]);
    });

    it("pressing the bar scrolls to the oldest open card and focuses its first option", async () => {
      const { messaging } = chiefWithCards(50);
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      await press(page.querySelector("[data-cards-bar] button"));
      const oldest = byText(page, "main ol > li", "Merge #1?");
      expect(scrolled.at(-1)).toBe(oldest);
      expect(document.activeElement).toBe(oldest?.querySelector("button"));
    });

    it("an answered card stays in place as its choice and time, and the bar counts one fewer", async () => {
      const { messaging, clock } = chiefWithCards(50);
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      clock.now = new Date(2026, 10, 25, 12, 10);
      await press(byText(page, "main ol > li:nth-child(3) button", "Approve"));
      const entries = timeline(page);
      expect(entries[1]).toBe("Answered: Approve, 12:10");
      expect(entries[2]).toContain("Merge #2?");
      expect(bar(page)).toBe("49 cards waiting");
    });

    it("says how long a card waits by the Messenger's clock, as the Inbox does (HAL-18473)", async () => {
      const { messaging } = chiefWithCards(1);
      const page = await openMessenger(messaging, [], false, () => new Date(2026, 10, 25, 13, 0));
      await openChat(page, "Chief");
      expect(byText(page, "main ol > li", "Merge #1?")?.textContent).toContain(
        "Waiting since 10:00 (3 h)",
      );
    });

    it("says 1 card waiting for one, and shows no bar once it is answered", async () => {
      const { messaging } = chiefWithCards(1);
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      expect(bar(page)).toBe("1 card waiting");
      await press(byText(page, "main ol button", "Reject"));
      expect(bar(page)).toBeUndefined();
      expect(timeline(page)).toEqual([
        "CChief · 09:00Chief: Morning",
        "Answered: Reject, 11:30",
        "CChief · 11:30Chief: Done",
      ]);
    });

    it("in a channel with open cards, shows only the waiting bar, not the cards bar", async () => {
      const messaging = new FakeAgentMessaging();
      const acme = messaging.addSource({ label: "Paperclip · Acme" });
      const chief = messaging.addAgent(acme.id, { name: "Chief" });
      const elena = messaging.addAgent(acme.id, { name: "Elena" });
      const channel = messaging.addConversation(chief.id, {
        title: "Engineering",
        members: [chief.id, elena.id],
      });
      messaging.addMessage(channel.id, {
        author: { kind: "me" },
        body: "Can you set up the server?",
        to: [elena.id],
        work: [
          { agent: elena.id, state: "asks-you", work: "w1", since: "2026-11-24T10:00:00.000Z" },
        ],
      });
      messaging.addInboxItem(acme.id, {
        question: "Which hostname?",
        work: "w1",
        createdAt: "2026-11-24T10:01:00.000Z",
        from: { kind: "agent", agent: elena.id, name: "Elena" },
      });
      // The lead's own card from its direct chat, which the cards bar would count too.
      messaging.addInboxItem(acme.id, {
        question: "Merge #1?",
        from: { kind: "agent", agent: chief.id, name: "Chief" },
      });
      const page = await openMessenger(messaging);
      await openChat(page, "Engineering");
      expect(page.querySelector("[data-waiting-bar]")).not.toBeNull();
      expect(bar(page)).toBeUndefined();
    });
  });
});

verifies("messenger.answer-elsewhere", () => {
  it("links a card its source can't take an answer to, with no option buttons", async () => {
    const messaging = new FakeAgentMessaging({ now: () => new Date(2026, 10, 25, 9, 0) });
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    const chief = messaging.addAgent(acme.id, { name: "Chief" });
    messaging.addConversation(chief.id);
    const link = "https://paperclip.acme.test/ACME/issues/ACME-7";
    messaging.addInboxItem(acme.id, {
      question: "Sign the launch plan",
      from: { kind: "agent", agent: chief.id, name: "Chief" },
      options: [],
      answerElsewhere: { link },
    });
    const opened: string[] = [];
    const page = await openMessenger(messaging, opened);
    await openChat(page, "Chief");
    const card = byText(page, "main ol > li", "Sign the launch plan");
    expect(card?.querySelector("a")?.textContent).toContain("Answer in Paperclip · Acme");
    expect(card?.querySelectorAll("button")).toHaveLength(0);
    await press(card?.querySelector("a") ?? null);
    expect(opened).toEqual([link]);
  });
});
