import type {
  MessageReaction,
  MessageReactions,
  ReactionsRead,
  ReactResult,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { openConnection } from "./connection.test-helper.ts";
import { FakePhoneMessaging } from "./messaging.test-helper.ts";

const thumbsUp: MessageReaction = {
  emoji: "👍",
  by: { kind: "me" },
  at: "2026-11-25T08:00:00Z",
};

/** Reactions that record each call and answer what a test set. */
class FakeReactions implements MessageReactions {
  readonly calls: unknown[][] = [];
  read: ReactionsRead = { outcome: "read", reactions: { "msg-1": [thumbsUp] } };
  result: ReactResult = { outcome: "saved", reactions: [thumbsUp] };

  list(conversation: string): Promise<ReactionsRead> {
    this.calls.push(["list", conversation]);
    return Promise.resolve(this.read);
  }

  react(message: string, emoji: string, on: boolean): Promise<ReactResult> {
    this.calls.push(["react", message, emoji, on]);
    return Promise.resolve(this.result);
  }
}

/** A phone past `hello` with `version`, on a fake view with reactions unless `withReactions` is false. */
async function connect(version = 5, withReactions = true) {
  const fake = new FakePhoneMessaging();
  const reactions = new FakeReactions();
  const gateway = fake.gateway();
  const view = withReactions ? { ...gateway.view, reactions } : gateway.view;
  const t = openConnection({ messaging: { ...gateway, view } });
  await t.say({ type: "hello", id: "h1", version });
  return { ...t, fake, reactions };
}

const readReactions = { type: "msg-read", id: "r1", what: "reactions", conversation: "conv-1" };
const react = {
  type: "msg-react",
  id: "x1",
  conversation: "conv-1",
  message: "msg-1",
  emoji: "👍",
  on: true,
};

verifies("remote-gateway.phone-reactions", () => {
  describe("reading a conversation's reactions", () => {
    it("sends one item per message that has any, as a page", async () => {
      const t = await connect();
      await t.say(readReactions);
      expect(t.sent.at(-1)).toEqual({
        type: "msg-data",
        replyTo: "r1",
        what: "reactions",
        items: [{ message: "msg-1", reactions: [thumbsUp] }],
      });
      expect(t.reactions.calls).toEqual([["list", "conv-1"]]);
    });

    it("refuses a conversation the view doesn't list with not-found, and reads nothing", async () => {
      const t = await connect();
      await t.say({ ...readReactions, conversation: "conv-9" });
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "r1", code: "not-found" });
      expect(t.reactions.calls).toEqual([]);
    });

    it("refuses with not-supported where the host keeps no reactions, and keeps the connection", async () => {
      const t = await connect(5, false);
      await t.say(readReactions);
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "r1", code: "not-supported" });
      expect(t.transport.closed).toBe(false);
    });

    it("passes a port's offline on as that code", async () => {
      const t = await connect();
      t.reactions.read = { outcome: "refused", reason: "offline" };
      await t.say(readReactions);
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "r1", code: "offline" });
    });

    it("counts each read against the phone's reactions reads, and refuses one over the rate", async () => {
      const t = await connect();
      t.fake.left.reactions = 1;
      await t.say(readReactions);
      await t.say({ ...readReactions, id: "r2" });
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "r2", code: "rate-limited" });
      expect(t.reactions.calls).toEqual([["list", "conv-1"]]);
      expect(t.fake.left).toMatchObject({ search: 10, send: 10 });
    });
  });

  describe("reacting", () => {
    it("adds the person's own reaction and answers with the message's reactions", async () => {
      const t = await connect();
      await t.say(react);
      expect(t.reactions.calls).toEqual([["react", "msg-1", "👍", true]]);
      expect(t.sent.at(-1)).toEqual({
        type: "msg-result",
        replyTo: "x1",
        result: { outcome: "saved", reactions: [thumbsUp] },
      });
    });

    it("refuses a message that isn't in the conversation with not-found, before the port", async () => {
      const t = await connect();
      await t.say({ ...react, message: "msg-99" });
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "x1", code: "not-found" });
      expect(t.reactions.calls).toEqual([]);
    });

    it("counts a reaction as a send, and refuses one over the rate", async () => {
      const t = await connect();
      t.fake.left.send = 0;
      await t.say(react);
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "x1", code: "rate-limited" });
      expect(t.reactions.calls).toEqual([]);
    });

    it("refuses with not-supported where the host keeps no reactions, and keeps the connection", async () => {
      const t = await connect(5, false);
      await t.say(react);
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "x1", code: "not-supported" });
      expect(t.transport.closed).toBe(false);
      expect(t.fake.left.send).toBe(10);
    });

    it("closes with malformed on an emoji that isn't one of the six", async () => {
      const t = await connect();
      await t.say({ ...react, emoji: "🔥" });
      expect(t.sent.at(-1)).toEqual({ type: "error", code: "malformed" });
      expect(t.transport.closed).toBe(true);
    });
  });

  describe("a version 4 phone", () => {
    it.each([readReactions, react])(
      "closes with malformed on $type, which version 4 doesn't list",
      async (message) => {
        const t = await connect(4);
        await t.say(message);
        expect(t.sent.at(-1)).toEqual({ type: "error", code: "malformed" });
        expect(t.reactions.calls).toEqual([]);
      },
    );

    it("keeps its Inbox and Messenger", async () => {
      const t = await connect(4);
      await t.say({ type: "msg-read", id: "r2", what: "conversations" });
      expect(t.sent.at(-1)).toMatchObject({ type: "msg-data", replyTo: "r2" });
    });
  });
});
