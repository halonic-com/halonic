import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { activityOf, Messenger, refusalOf } from "./messenger.ts";

/** A clock that moves a minute on each read, so every item has its own time. */
function ticking(): () => Date {
  let minutes = 0;
  return () => new Date(Date.UTC(2026, 10, 24, 10, minutes++));
}

/** Lets every promise that is already settled run its callbacks, with no timer. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

/** Two sources, Acme and Globex, each with an agent named Chief, and a chat with each. */
function twoChiefs() {
  const messaging = new FakeAgentMessaging({ now: ticking() });
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const globex = messaging.addSource({ label: "Paperclip · Globex" });
  const acmeChief = messaging.addAgent(acme.id, { name: "Chief", activity: "working" });
  const globexChief = messaging.addAgent(globex.id, { name: "Chief", activity: "paused" });
  const acmeChat = messaging.addConversation(acmeChief.id);
  const globexChat = messaging.addConversation(globexChief.id);
  return { messaging, acme, globex, acmeChat, globexChat };
}

verifies("messenger.conversations", () => {
  describe("Messenger.rows", () => {
    it("lists one conversation per agent, newest first, each with its source's label", async () => {
      const { messaging } = twoChiefs();
      const rows = await new Messenger(messaging).rows();
      expect(rows.map((row) => [row.conversation.title, row.source?.label])).toEqual([
        ["Chief", "Paperclip · Globex"],
        ["Chief", "Paperclip · Acme"],
      ]);
      expect(rows.map(activityOf)).toEqual(["paused", "working"]);
    });

    it("lists under Waiting for me only the conversations whose agent wrote last", async () => {
      const { messaging, acmeChat, globexChat } = twoChiefs();
      messaging.addMessage(acmeChat.id, { body: "Shall I merge #12?" });
      messaging.addMessage(globexChat.id, { body: "Done." });
      messaging.addMessage(globexChat.id, { body: "Thanks", author: { kind: "me" } });
      const rows = await new Messenger(messaging).rows("waiting");
      expect(rows.map((row) => row.conversation.id)).toEqual([acmeChat.id]);
    });

    it("lists every chat when one chat's messages can't be read, that one with no preview", async () => {
      const { messaging, acmeChat, globexChat } = twoChiefs();
      messaging.addMessage(acmeChat.id, { body: "Shall I merge #12?" });
      messaging.addMessage(globexChat.id, { body: "Done." });
      const read = messaging.listMessages.bind(messaging);
      vi.spyOn(messaging, "listMessages").mockImplementation((conversation) =>
        conversation === globexChat.id ? Promise.reject(new Error("gone")) : read(conversation),
      );
      const failed = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const rows = await new Messenger(messaging).rows();
      expect(rows.map((row) => [row.conversation.id, row.last?.body])).toEqual([
        [globexChat.id, undefined],
        [acmeChat.id, "Shall I merge #12?"],
      ]);
      expect(failed).toHaveBeenCalledOnce();
      failed.mockRestore();
    });

    it("shows `other` for a conversation whose agent it doesn't know", () => {
      const { acmeChat } = twoChiefs();
      expect(
        activityOf({ conversation: acmeChat, agents: [], sourceAgents: [], source: undefined }),
      ).toBe("other");
    });
  });

  describe("Messenger.sendDraft", () => {
    it("sends the draft through AgentMessaging.send, clears it and shows the message", async () => {
      const { messaging, acmeChat } = twoChiefs();
      const send = vi.spyOn(messaging, "send");
      const messenger = new Messenger(messaging);
      const [row] = (await messenger.rows()).filter((each) => each.conversation.id === acmeChat.id);
      messenger.setDraft(acmeChat.id, "Morning");
      const outcome = await messenger.sendDraft(acmeChat.id, row);
      expect(outcome.outcome).toBe("sent");
      expect(send).toHaveBeenCalledWith(acmeChat.id, "Morning");
      expect(messenger.draft(acmeChat.id)).toBe("");
      const messages = await messenger.messages(acmeChat.id);
      expect(messages.map((message) => [message.author.kind, message.body])).toEqual([
        ["me", "Morning"],
      ]);
    });

    it("keeps text typed while the draft was being sent", async () => {
      const { messaging, acmeChat } = twoChiefs();
      const messenger = new Messenger(messaging);
      const send = messaging.send.bind(messaging);
      vi.spyOn(messaging, "send").mockImplementation(async (conversation, body) => {
        messenger.setDraft(conversation, "Also the invoices");
        return send(conversation, body);
      });
      messenger.setDraft(acmeChat.id, "Morning");
      expect((await messenger.sendDraft(acmeChat.id)).outcome).toBe("sent");
      expect(messenger.draft(acmeChat.id)).toBe("Also the invoices");
    });

    it("offline, keeps the typed text as a draft and sends nothing", async () => {
      const { messaging, acme, acmeChat } = twoChiefs();
      messaging.goOffline(acme.id);
      const send = vi.spyOn(messaging, "send");
      const messenger = new Messenger(messaging);
      const [row] = (await messenger.rows()).filter((each) => each.conversation.id === acmeChat.id);
      messenger.setDraft(acmeChat.id, "Morning");
      expect(row === undefined ? undefined : refusalOf(row)).toBe("offline");
      expect(await messenger.sendDraft(acmeChat.id, row)).toEqual({
        outcome: "kept",
        reason: "offline",
      });
      expect(send).not.toHaveBeenCalled();
      expect(messenger.draft(acmeChat.id)).toBe("Morning");
    });

    it("keeps the draft when the source refuses it, as when its line was cut after the list was read", async () => {
      const { messaging, acme, acmeChat } = twoChiefs();
      const messenger = new Messenger(messaging);
      messaging.signOut(acme.id);
      messenger.setDraft(acmeChat.id, "Morning");
      expect(await messenger.sendDraft(acmeChat.id)).toEqual({
        outcome: "kept",
        reason: "signed-out",
      });
      expect(messenger.draft(acmeChat.id)).toBe("Morning");
    });

    it("sends nothing for a blank draft", async () => {
      const { messaging, acmeChat } = twoChiefs();
      const send = vi.spyOn(messaging, "send");
      const messenger = new Messenger(messaging);
      messenger.setDraft(acmeChat.id, "  ");
      expect(await messenger.sendDraft(acmeChat.id)).toEqual({ outcome: "kept", reason: "blank" });
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe("Messenger.messages", () => {
    it("finds a conversation's messages by the text they hold, ignoring case", async () => {
      const { messaging, acmeChat } = twoChiefs();
      messaging.addMessage(acmeChat.id, { body: "The invoice run is done." });
      messaging.addMessage(acmeChat.id, { body: "Shall I send the Invoices?" });
      messaging.addMessage(acmeChat.id, { body: "Morning" });
      const messenger = new Messenger(messaging);
      const found = await messenger.messages(acmeChat.id, "invoice");
      expect(found.map((message) => message.body)).toEqual([
        "The invoice run is done.",
        "Shall I send the Invoices?",
      ]);
      expect(await messenger.messages(acmeChat.id, " ")).toHaveLength(3);
    });
  });

  describe("Messenger.watch", () => {
    it("hears each source that changes, until it stops", async () => {
      const { messaging, acme, acmeChat } = twoChiefs();
      const heard: string[] = [];
      const stop = new Messenger(messaging).watch((source) => heard.push(source));
      messaging.addMessage(acmeChat.id, { body: "Shall I merge #12?" });
      await settle();
      expect(heard).toEqual([acme.id]);
      stop();
      messaging.addMessage(acmeChat.id, { body: "Merged." });
      await settle();
      expect(heard).toEqual([acme.id]);
    });
  });
});
