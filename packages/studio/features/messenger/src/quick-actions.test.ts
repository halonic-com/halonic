import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { Messenger } from "./messenger.ts";
import { askForUpdateText } from "./quick-actions.ts";

/** A clock that moves a minute on each read, so every item has its own time. */
function ticking(): () => Date {
  let minutes = 0;
  return () => new Date(Date.UTC(2026, 10, 24, 10, minutes++));
}

/** Acme's Chief with a chat and two open cards, and a card from Acme's Writer. */
function chiefWithCards() {
  const messaging = new FakeAgentMessaging({ now: ticking() });
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(acme.id, { name: "Chief" });
  const writer = messaging.addAgent(acme.id, { name: "Writer" });
  messaging.addConversation(chief.id);
  const options = [
    { id: "approve", label: "Approve" },
    { id: "reject", label: "Reject" },
  ];
  const fromChief = { kind: "agent", agent: chief.id, name: "Chief" } as const;
  const merge = messaging.addInboxItem(acme.id, {
    question: "Merge #12?",
    from: fromChief,
    options,
  });
  const deploy = messaging.addInboxItem(acme.id, { question: "Deploy?", from: fromChief, options });
  messaging.addInboxItem(acme.id, {
    question: "Send the reply?",
    from: { kind: "agent", agent: writer.id, name: "Writer" },
  });
  return { messaging, acme, merge, deploy };
}

async function chiefRow(messenger: Messenger) {
  const [row] = await messenger.rows();
  if (row === undefined) throw new Error("no chat");
  return row;
}

verifies("messenger.quick-actions", () => {
  describe("QuickActions.cards", () => {
    it("gives the chat agent's open cards, oldest first, and no other agent's", async () => {
      const { messaging, merge, deploy } = chiefWithCards();
      const messenger = new Messenger(messaging);
      const cards = await messenger.quickActions.cards(await chiefRow(messenger));
      expect(cards.map((card) => card.id)).toEqual([merge.id, deploy.id]);
    });

    it("leaves out a card that is answered already", async () => {
      const { messaging, merge, deploy } = chiefWithCards();
      messaging.answerElsewhere(
        merge.id,
        { kind: "person", name: "Dana" },
        { kind: "reply", text: "ok" },
      );
      const messenger = new Messenger(messaging);
      const cards = await messenger.quickActions.cards(await chiefRow(messenger));
      expect(cards.map((card) => card.id)).toEqual([deploy.id]);
    });
  });

  describe("QuickActions.answerCard", () => {
    it("answers the card with its option in exactly one `answer` call, and sends nothing", async () => {
      const { messaging, merge } = chiefWithCards();
      const answer = vi.spyOn(messaging, "answer");
      const send = vi.spyOn(messaging, "send");
      const messenger = new Messenger(messaging);
      const row = await chiefRow(messenger);
      const outcome = await messenger.quickActions.answerCard(row, merge, "approve");
      expect(outcome.outcome).toBe("answered");
      expect(answer.mock.calls).toEqual([[merge.id, { kind: "option", option: "approve" }]]);
      expect(send).not.toHaveBeenCalled();
    });

    it("offline, answers nothing and says why", async () => {
      const { messaging, acme, merge } = chiefWithCards();
      messaging.goOffline(acme.id);
      const answer = vi.spyOn(messaging, "answer");
      const messenger = new Messenger(messaging);
      const outcome = await messenger.quickActions.answerCard(
        await chiefRow(messenger),
        merge,
        "approve",
      );
      expect(outcome).toEqual({ outcome: "refused", reason: "offline" });
      expect(answer).not.toHaveBeenCalled();
    });

    it("offline, answers no question card either", async () => {
      const { messaging, acme, merge } = chiefWithCards();
      messaging.goOffline(acme.id);
      const answer = vi.spyOn(messaging, "answer");
      const messenger = new Messenger(messaging);
      const outcome = await messenger.quickActions.answerQuestions(
        await chiefRow(messenger),
        merge,
        [{ question: "repo", options: ["separate"] }],
      );
      expect(outcome).toEqual({ outcome: "refused", reason: "offline" });
      expect(answer).not.toHaveBeenCalled();
    });
  });

  describe("QuickActions.askForUpdate", () => {
    it("sends one plain message in exactly one `send` call, and answers nothing", async () => {
      const { messaging } = chiefWithCards();
      const answer = vi.spyOn(messaging, "answer");
      const send = vi.spyOn(messaging, "send");
      const messenger = new Messenger(messaging);
      const row = await chiefRow(messenger);
      const outcome = await messenger.quickActions.askForUpdate(row);
      expect(outcome.outcome).toBe("sent");
      expect(send.mock.calls).toEqual([[row.conversation.id, askForUpdateText]]);
      expect(answer).not.toHaveBeenCalled();
    });

    it("signed out, sends nothing and says why", async () => {
      const { messaging, acme } = chiefWithCards();
      messaging.signOut(acme.id);
      const send = vi.spyOn(messaging, "send");
      const messenger = new Messenger(messaging);
      const outcome = await messenger.quickActions.askForUpdate(await chiefRow(messenger));
      expect(outcome).toEqual({ outcome: "refused", reason: "signed-out" });
      expect(send).not.toHaveBeenCalled();
    });
  });
});
