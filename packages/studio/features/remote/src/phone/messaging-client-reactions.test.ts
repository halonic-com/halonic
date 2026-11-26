import type { MessageReaction } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayScene } from "../test-support/gateway-scene.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const thumbsUp: MessageReaction = { emoji: "👍", by: { kind: "me" }, at: "2026-11-25T08:00:00Z" };

verifies("remote.phone-messaging-client", () => {
  describe("reactions at version 5", () => {
    it("reads a conversation's reactions by their page, after sending it once", async () => {
      const scene = new GatewayScene();
      scene.connect();
      const read = scene.client.messaging.readReactions("c1");
      const sent = scene.tunnel.sentOf("msg-read");
      expect(sent).toEqual([
        { type: "msg-read", id: sent[0]?.id, what: "reactions", conversation: "c1" },
      ]);
      const items = [{ message: "m1", reactions: [thumbsUp] }];
      scene.host({
        type: "msg-data",
        replyTo: sent[0]?.id ?? "",
        what: "reactions",
        items,
        more: "40",
      });
      expect(await read).toEqual({ kind: "done", value: { items, more: "40" } });
      void scene.client.messaging.readReactions("c1", "40");
      expect(scene.tunnel.lastOf("msg-read")).toMatchObject({ what: "reactions", cursor: "40" });
      expect(scene.tunnel.ended).toEqual([]);
    });

    it("adds the person's 👍 and settles it by the message's reactions after it", async () => {
      const scene = new GatewayScene();
      scene.connect();
      const react = scene.client.messaging.react("c1", "m1", "👍", true);
      const sent = scene.tunnel.lastOf("msg-react");
      expect(sent).toMatchObject({ conversation: "c1", message: "m1", emoji: "👍", on: true });
      scene.host({
        type: "msg-result",
        replyTo: sent.id,
        result: { outcome: "saved", reactions: [thumbsUp] },
      });
      expect(await react).toEqual({ kind: "done", value: [thumbsUp] });
    });

    it("settles a reaction the host refuses with not-supported, and keeps the connection", async () => {
      const scene = new GatewayScene();
      scene.connect();
      const react = scene.client.messaging.react("c1", "m1", "👀", false);
      scene.host({
        type: "error",
        replyTo: scene.tunnel.lastOf("msg-react").id,
        code: "not-supported",
      });
      expect(await react).toEqual({ kind: "refused", code: "not-supported" });
      expect(scene.tunnel.ended).toEqual([]);
    });

    it("ends the session on a reaction with an emoji that isn't one of the six", async () => {
      const scene = new GatewayScene();
      scene.connect();
      const read = scene.client.messaging.readReactions("c1");
      const replyTo = scene.tunnel.lastOf("msg-read").id;
      const fire = { emoji: "🔥", by: { kind: "me" }, at: "2026-11-25T08:00:00Z" };
      scene.host(
        JSON.stringify({
          type: "msg-data",
          replyTo,
          what: "reactions",
          items: [{ message: "m1", reactions: [fire] }],
        }),
      );
      expect(scene.tunnel.ended).toEqual([1]);
      expect(await read).toEqual({ kind: "cut-off" });
    });

    it("ends the session on a reactions page whose cursor breaks the host's id rule", async () => {
      const scene = new GatewayScene();
      scene.connect();
      const read = scene.client.messaging.readReactions("c1");
      // `:` is fine in a messaging id, but never in the host's own cursor.
      scene.host({
        type: "msg-data",
        replyTo: scene.tunnel.lastOf("msg-read").id,
        what: "reactions",
        items: [],
        more: "a:b",
      });
      expect(scene.tunnel.ended).toEqual([1]);
      expect(await read).toEqual({ kind: "cut-off" });
    });

    it("still settles an answer by a closed result, and keeps the connection", async () => {
      const scene = new GatewayScene();
      scene.connect();
      const answer = scene.client.messaging.answer("i1", { kind: "option", option: "yes" });
      const result = {
        outcome: "closed",
        reason: "expired",
        closedAt: "2026-11-25T08:00:00Z",
      } as const;
      scene.host({ type: "msg-result", replyTo: scene.tunnel.lastOf("msg-answer").id, result });
      expect(await answer).toEqual({ kind: "done", value: result });
      expect(scene.tunnel.ended).toEqual([]);
    });

    it("ends the session on a saved result to a msg-answer", async () => {
      const scene = new GatewayScene();
      scene.connect();
      const answer = scene.client.messaging.answer("i1", { kind: "option", option: "yes" });
      scene.host({
        type: "msg-result",
        replyTo: scene.tunnel.lastOf("msg-answer").id,
        result: { outcome: "saved", reactions: [] },
      });
      expect(scene.tunnel.ended).toEqual([1]);
      expect(await answer).toEqual({ kind: "cut-off" });
    });

    it("ends the session on a saved result to a msg-send", async () => {
      const scene = new GatewayScene();
      scene.connect();
      const channel = {
        id: "c1",
        source: "acme",
        agent: "lead",
        members: ["lead"],
        title: "Launch",
        updatedAt: "2026-11-25T10:00:00.000Z",
        waitingForMe: false,
      };
      const send = scene.client.messaging.send(channel, "Ship it");
      scene.host({
        type: "msg-result",
        replyTo: scene.tunnel.lastOf("msg-send").id,
        result: { outcome: "saved", reactions: [] },
      });
      expect(scene.tunnel.ended).toEqual([1]);
      expect(await send).toEqual({ kind: "cut-off" });
    });
  });
});
