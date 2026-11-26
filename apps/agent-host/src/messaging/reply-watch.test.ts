import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ReplyWatch } from "./reply-watch.ts";

/** A watch on a clock the test moves, and a fake source with Chief and one conversation with him. */
function watching(conversation: { agentWorking?: boolean } = {}) {
  let now = Date.parse("2026-11-26T10:00:00.000Z");
  const reported: unknown[] = [];
  const replies = new ReplyWatch({
    clock: { now: () => new Date(now) },
    report: (error) => reported.push(error),
  });
  const messaging = new FakeAgentMessaging({ idPrefix: "a" });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  const chat = messaging.addConversation(chief.id, conversation);
  const sendAsMe = (body: string) =>
    messaging.addMessage(chat.id, { body, author: { kind: "me" } });
  return {
    replies,
    messaging,
    chat,
    sendAsMe,
    reported,
    wait: (ms: number) => {
      now += ms;
    },
  };
}

verifies("agent-host.paperclip-polling", () => {
  it("waits while the person's message is the last, and stops once the agent answers", async () => {
    const { replies, messaging, chat, sendAsMe } = watching();
    sendAsMe("Can you check the release?");
    replies.watch(messaging, chat.id);

    expect(await replies.waiting()).toBe(true);
    messaging.addMessage(chat.id, { body: "On it." });
    expect(await replies.waiting()).toBe(false);

    sendAsMe("Thanks");
    expect(await replies.waiting()).toBe(false);
  });

  it("goes on waiting after an automatic receipt, which isn't the agent's answer", async () => {
    const { replies, messaging, chat, sendAsMe } = watching();
    sendAsMe("Can you check the release?");
    messaging.addMessage(chat.id, { body: "Chief got your message.", automatic: true });
    replies.watch(messaging, chat.id);

    expect(await replies.waiting()).toBe(true);
  });

  it("waits while the agent is working on the conversation, even after its answer", async () => {
    const { replies, messaging, chat } = watching({ agentWorking: true });
    messaging.addMessage(chat.id, { body: "Still checking." });
    replies.watch(messaging, chat.id);

    expect(await replies.waiting()).toBe(true);
  });

  it("stops watching 3 minutes after the send", async () => {
    const { replies, messaging, chat, sendAsMe, wait } = watching();
    sendAsMe("Can you check the release?");
    replies.watch(messaging, chat.id);

    wait(3 * 60_000 - 1);
    expect(await replies.waiting()).toBe(true);
    wait(1);
    expect(await replies.waiting()).toBe(false);
  });

  it("reports a read that fails and stops watching that conversation", async () => {
    const { replies, messaging, chat, sendAsMe, reported } = watching();
    sendAsMe("Can you check the release?");
    replies.watch(messaging, chat.id);
    const broken = new Error("the cache can't be read");
    messaging.listConversations = () => Promise.reject(broken);

    expect(await replies.waiting()).toBe(false);
    expect(reported).toEqual([broken]);
  });
});
