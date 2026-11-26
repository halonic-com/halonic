// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messengerWords } from "../messenger-words.ts";
import { askForUpdateText } from "../quick-actions.ts";
import { byText, openChat, openMessenger, press, said } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

/** Acme's Chief, with a chat and an open card "Merge #12?" that offers Approve and Reject. */
function chiefAsks() {
  const messaging = new FakeAgentMessaging();
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(acme.id, { name: "Chief" });
  const chat = messaging.addConversation(chief.id);
  const card = messaging.addInboxItem(acme.id, {
    question: "Merge **#12**?",
    from: { kind: "agent", agent: chief.id, name: "Chief" },
    options: [
      { id: "approve", label: "Approve" },
      { id: "reject", label: "Reject" },
    ],
  });
  return { messaging, acme, chief, chat, card };
}

function transcript(page: HTMLElement): string {
  return page.querySelector("main ol")?.textContent ?? "";
}

verifies("messenger.quick-actions", () => {
  describe("a chat's quick actions", () => {
    it("shows the agent's open card in its chat, and Approve answers it with one `answer` call", async () => {
      const { messaging, card } = chiefAsks();
      const answer = vi.spyOn(messaging, "answer");
      const send = vi.spyOn(messaging, "send");
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      expect(transcript(page)).toContain("Needs you");
      expect(transcript(page)).toContain("Merge #12?");
      expect(transcript(page)).toContain("Also in your Inbox. Answering here answers it there.");
      await press(byText(page, "main ol button", "Approve"));
      expect(answer.mock.calls).toEqual([[card.id, { kind: "option", option: "approve" }]]);
      expect(send).not.toHaveBeenCalled();
      // It ends as a card decided elsewhere does: its final state, then it settles away.
      expect(page.querySelector("[data-chat-card]")).toBeNull();
      expect(transcript(page)).toContain("Approved by you · 10:00");
    });

    it("reads out the option that answered a card, and focuses the next card's first option, then the box", async () => {
      const { messaging, acme, chief } = chiefAsks();
      messaging.addInboxItem(acme.id, {
        question: "When shall I ship?",
        from: { kind: "agent", agent: chief.id, name: "Chief" },
        options: [
          { id: "tomorrow", label: "Tomorrow" },
          { id: "later", label: "Next week" },
        ],
      });
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      await press(byText(page, "main ol button", "Tomorrow"));
      expect(said(page)).toBe("Answered: Tomorrow.");
      expect(transcript(page)).toContain("Answered by you · 10:00");
      expect(byText(page, "main ol button", "Tomorrow")).toBeUndefined();
      expect(document.activeElement).toBe(byText(page, "main ol button", "Approve"));
      await press(byText(page, "main ol button", "Approve"));
      expect(said(page)).toBe("Answered: Approve.");
      expect(document.activeElement).toBe(page.querySelector("textarea"));
    });

    it("reads the same answer to two cards out twice (HAL-18316 MS8)", async () => {
      const { messaging, acme, chief } = chiefAsks();
      const yes = [{ id: "yes", label: "Yes" }];
      const from = { kind: "agent", agent: chief.id, name: "Chief" } as const;
      messaging.addInboxItem(acme.id, { question: "Tag it?", from, options: yes });
      messaging.addInboxItem(acme.id, { question: "Ship it?", from, options: yes });
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      const status = page.querySelector('main p.sr-only[role="status"]');
      const lines: string[] = [];
      const observer = new MutationObserver(() => lines.push(status?.textContent ?? ""));
      if (status !== null) observer.observe(status, { childList: true, subtree: true });
      await press(byText(page, "main ol button", "Yes"));
      await press(byText(page, "main ol button", "Yes"));
      observer.disconnect();
      expect(lines.filter((line) => line === "Answered: Yes.")).toHaveLength(2);
    });

    it("says who answered first when the card was answered elsewhere, and answers nothing more", async () => {
      const { messaging, card } = chiefAsks();
      // The change isn't heard before the click, as when another client answers just before it.
      vi.spyOn(messaging, "changes").mockReturnValue({ [Symbol.asyncIterator]: idle });
      const answer = vi.spyOn(messaging, "answer");
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      messaging.answerElsewhere(
        card.id,
        { kind: "person", name: "Dana" },
        { kind: "reply", text: "No" },
      );
      await press(byText(page, "main ol button", "Approve"));
      expect(answer).toHaveBeenCalledTimes(1);
      expect(transcript(page)).toContain("Dana answered this first.");
    });

    it("says you already answered when you answered the card on another device", async () => {
      const { messaging, card } = chiefAsks();
      vi.spyOn(messaging, "changes").mockReturnValue({ [Symbol.asyncIterator]: idle });
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      messaging.answerElsewhere(card.id, { kind: "me" }, { kind: "reply", text: "No" });
      await press(byText(page, "main ol button", "Approve"));
      expect(transcript(page)).toContain("You already answered this.");
    });

    it("says since when a card waits as the Inbox does, and draws options primary, secondary, then ghost", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 10, 8, 13, 0));
      const messaging = new FakeAgentMessaging();
      const acme = messaging.addSource({ label: "Paperclip · Acme" });
      const chief = messaging.addAgent(acme.id, { name: "Chief" });
      messaging.addConversation(chief.id);
      messaging.addInboxItem(acme.id, {
        question: "Ship the release notes?",
        from: { kind: "agent", agent: chief.id, name: "Chief" },
        createdAt: new Date(2026, 10, 8, 10, 0).toISOString(),
        options: [
          { id: "approve", label: "Approve" },
          { id: "reject", label: "Reject" },
          { id: "changes", label: "Ask for changes" },
        ],
      });
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      expect(transcript(page)).toContain("Waiting since 10:00 (3 h)");
      const variant = (label: string) => byText(page, "main ol button", label)?.className ?? "";
      expect(variant("Approve")).toContain("bg-primary");
      expect(variant("Reject")).toContain("border-border-strong");
      expect(variant("Ask for changes")).toContain("border-transparent text-fg-muted");
      vi.useRealTimers();
    });

    it("Ask for an update sends one plain message with one `send` call and shows it", async () => {
      const { messaging, chat } = chiefAsks();
      const answer = vi.spyOn(messaging, "answer");
      const send = vi.spyOn(messaging, "send");
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      await press(byText(page, "main button", "Ask for an update"));
      expect(send.mock.calls).toEqual([[chat.id, askForUpdateText]]);
      expect(answer).not.toHaveBeenCalled();
      expect(transcript(page)).toContain(`You: ${askForUpdateText}`);
    });

    it("offline, Ask for an update sends nothing and says why", async () => {
      const { messaging, acme } = chiefAsks();
      messaging.goOffline(acme.id);
      const send = vi.spyOn(messaging, "send");
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      await press(byText(page, "main button", "Ask for an update"));
      expect(send).not.toHaveBeenCalled();
      expect(page.textContent).toContain("Paperclip · Acme is offline, so nothing was sent.");
    });
  });
});

/** A change feed that never yields, so the page doesn't read again on its own. */
function idle(): AsyncIterator<string> {
  return {
    next: () => new Promise(() => {}),
    return: () => Promise.resolve({ done: true, value: undefined }),
  };
}

verifies("messenger.option-note", () => {
  it("leaves out an option whose note is required, and offers the others", async () => {
    const { messaging, acme, chief } = chiefAsks();
    messaging.addInboxItem(acme.id, {
      question: "Hire Iris?",
      from: { kind: "agent", agent: chief.id, name: "Chief" },
      options: [
        { id: "hire", label: "Hire" },
        {
          id: "request-changes",
          label: "Request changes",
          noteRequired: true,
          noteLabel: "What should change?",
        },
        { id: "later", label: "Later", noteLabel: "Why?" },
      ],
    });
    const page = await openMessenger(messaging);
    await openChat(page, "Chief");
    const buttons = [...page.querySelectorAll("main ol button")].map((b) => b.textContent);
    expect(buttons).toContain("Hire");
    expect(buttons).toContain("Later");
    expect(buttons).not.toContain("Request changes");
  });

  it("says which left-out options need a note in the Inbox, instead of the Also in your Inbox line", async () => {
    const { messaging, acme, chief } = chiefAsks();
    const changes = { id: "changes", label: "Request changes", noteRequired: true };
    messaging.addInboxItem(acme.id, {
      question: "Ship #13?",
      from: { kind: "agent", agent: chief.id, name: "Chief" },
      options: [{ id: "approve", label: "Approve" }, { id: "reject", label: "Reject" }, changes],
    });
    const page = await openMessenger(messaging);
    await openChat(page, "Chief");
    const card = [...page.querySelectorAll("[data-chat-card]")].find((each) =>
      each.textContent?.includes("Ship #13?"),
    );
    const buttons = [...(card?.querySelectorAll("button") ?? [])].map((b) => b.textContent);
    expect(buttons).toEqual(["Approve", "Reject"]);
    expect(card?.textContent).toContain("Request changes needs a note: choose it in your Inbox.");
    expect(card?.textContent).not.toContain("Also in your Inbox");
  });

  it("names two or more left-out options together", () => {
    expect(messengerWords.card.needsNoteInInbox(["Request changes", "Reject"])).toBe(
      "Request changes and Reject need a note: choose them in your Inbox.",
    );
    expect(messengerWords.card.needsNoteInInbox(["A", "B", "C"])).toBe(
      "A, B and C need a note: choose them in your Inbox.",
    );
  });
});
