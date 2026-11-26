import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeAgentMessaging } from "./fake-agent-messaging.ts";
import { offPatternMessagingIds } from "./messaging-ids.ts";

/** A source with an agent, an item with a file, and a conversation with a message holding a file. */
function fill(fake: FakeAgentMessaging) {
  const files = [{ name: "a.png", type: "image/png", bytes: new Uint8Array([1]) }];
  const source = fake.addSource({ label: "Acme", provider: "paperclip" });
  const agent = fake.addAgent(source.id, { name: "Chief" });
  const chat = fake.addConversation(agent.id);
  fake.addMessage(chat.id, { body: "Hello", attachments: files });
  fake.addInboxItem(source.id, { question: "Ship it?", files });
}

verifies("contracts.agent-messaging-ids", () => {
  describe("offPatternMessagingIds", () => {
    it("names no id of a provider whose ids follow the pattern", async () => {
      const fake = new FakeAgentMessaging();
      fill(fake);

      expect(await offPatternMessagingIds(fake)).toEqual([]);
    });

    it("names each id that breaks the pattern once, so the contract fails", async () => {
      const fake = new FakeAgentMessaging({ idPrefix: "acme item" });
      fill(fake);

      const off = await offPatternMessagingIds(fake);

      // Source, agent, conversation, message, its file, item and its file: seven ids, each once.
      expect(off).toHaveLength(7);
      expect(off.every((id) => id.startsWith("acme item-"))).toBe(true);
    });

    it("names the references the phone checks: a message's to, its agent author and who answered", async () => {
      const fake = new FakeAgentMessaging();
      const source = fake.addSource({ label: "Acme", provider: "paperclip" });
      const chat = fake.addConversation(fake.addAgent(source.id, { name: "Chief" }).id);
      const offAgent = { kind: "agent", agent: "acme agent", name: "Bo" } as const;
      fake.addMessage(chat.id, { body: "Hi", author: offAgent, to: ["acme to"] });
      const item = fake.addInboxItem(source.id, { question: "Ship it?" });
      fake.answerElsewhere(
        item.id,
        { ...offAgent, agent: "acme answerer" },
        {
          kind: "option",
          option: "yes",
        },
      );

      const off = await offPatternMessagingIds(fake);

      expect([...off].sort()).toEqual(["acme agent", "acme answerer", "acme to"]);
    });
  });
});
