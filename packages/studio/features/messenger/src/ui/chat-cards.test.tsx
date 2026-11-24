// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { askForUpdateText } from "../quick-actions.ts";
import { byText, openChat, openMessenger, press } from "../test-support/page.tsx";
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
  return { messaging, acme, chat, card };
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
      expect(transcript(page)).not.toContain("Merge #12?");
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
