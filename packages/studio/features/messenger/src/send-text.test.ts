import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import type { DraftFile } from "./draft-files.ts";
import { Messenger } from "./messenger.ts";

const screenshot: DraftFile = {
  name: "login.png",
  type: "image/png",
  size: 3,
  arrayBuffer: () => Promise.resolve(new Uint8Array(3).fill(7).buffer),
};

async function chiefChat() {
  const messaging = new FakeAgentMessaging();
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(acme.id, { name: "Chief" });
  const chat = messaging.addConversation(chief.id);
  const messenger = new Messenger(messaging);
  const [row] = await messenger.rows();
  if (row === undefined) throw new Error("no chat");
  return { messaging, acme, chat, messenger, row };
}

verifies("messenger.send-text", () => {
  it("sends only its text and leaves the chat's draft, files and picks as they were", async () => {
    const { messaging, chat, messenger, row } = await chiefChat();
    messenger.setDraft(chat.id, "Half a thought");
    messenger.files.add(chat.id, screenshot);
    messenger.setNamed(chat.id, [chat.agent]);
    const send = vi.spyOn(messaging, "send");

    const outcome = await messenger.sendText(chat.id, "Where are we with the release?", row);

    expect(outcome.outcome).toBe("sent");
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(chat.id, "Where are we with the release?");
    expect(messenger.draft(chat.id)).toBe("Half a thought");
    expect(messenger.files.of(chat.id).map((file) => file.name)).toEqual(["login.png"]);
    expect(messenger.named(chat.id)).toEqual([chat.agent]);
    const messages = await messenger.messages(chat.id);
    expect(messages.map((message) => message.attachments.length)).toEqual([0]);
  });

  it("offline, sends nothing and says so", async () => {
    const { messaging, acme, chat } = await chiefChat();
    messaging.goOffline(acme.id);
    const messenger = new Messenger(messaging);
    const [row] = await messenger.rows();
    const send = vi.spyOn(messaging, "send");

    expect(await messenger.sendText(chat.id, "Where are we?", row)).toEqual({
      outcome: "kept",
      reason: "offline",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("passes on the source's refusal", async () => {
    const { messaging, acme, chat, messenger } = await chiefChat();
    messaging.signOut(acme.id);
    expect(await messenger.sendText(chat.id, "Where are we?")).toEqual({
      outcome: "kept",
      reason: "signed-out",
    });
  });

  it("sends nothing for blank text", async () => {
    const { messaging, chat, messenger, row } = await chiefChat();
    const send = vi.spyOn(messaging, "send");
    expect(await messenger.sendText(chat.id, "   ", row)).toEqual({
      outcome: "kept",
      reason: "blank",
    });
    expect(send).not.toHaveBeenCalled();
  });
});
