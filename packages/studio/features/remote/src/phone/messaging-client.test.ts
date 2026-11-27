import { type Conversation, gatewayFallbackProtocolVersion } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayScene } from "../test-support/gateway-scene.ts";
import type { MessagingClient } from "./messaging-client.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const channel: Conversation = {
  id: "c1",
  source: "acme",
  agent: "lead",
  members: ["lead", "writer"],
  title: "Launch",
  updatedAt: "2026-11-25T10:00:00.000Z",
  waitingForMe: false,
};

/** One request of each `msg-*` type that a host answers with data or a result. */
const requests: Record<string, (messaging: MessagingClient) => Promise<unknown>> = {
  "msg-read": (messaging) => messaging.readList("inbox"),
  "msg-search": (messaging) => messaging.search("launch"),
  "msg-answer": (messaging) => messaging.answer("i1", { kind: "option", option: "yes" }),
  "msg-send": (messaging) => messaging.send(channel, "Ship it", ["writer"]),
};

/** The id of the one message the page sent, after checking it sent only that one. */
function onlyId(scene: GatewayScene, type: "msg-read" | "msg-search" | "msg-answer" | "msg-send") {
  const sent = scene.tunnel.sentOf(type);
  expect(sent).toHaveLength(1);
  return sent[0]?.id ?? "";
}

verifies("remote.phone-messaging-client", () => {
  describe("requests and their answers", () => {
    it("settles a list read by its page, after sending it once", async () => {
      const scene = new GatewayScene();
      scene.connect();
      const read = scene.client.messaging.readList("inbox");
      const replyTo = onlyId(scene, "msg-read");
      scene.host({ type: "msg-data", replyTo, what: "inbox", items: [{ id: "i1" }] });
      expect(await read).toEqual({
        kind: "done",
        value: { items: [{ id: "i1" }], more: undefined },
      });
      expect(scene.tunnel.ended).toEqual([]);
    });

    it("reads on with the page's more as the cursor", async () => {
      const scene = new GatewayScene();
      scene.connect();
      const first = scene.client.messaging.readList("conversations");
      const replyTo = scene.tunnel.lastOf("msg-read").id;
      scene.host({ type: "msg-data", replyTo, what: "conversations", items: [], more: "40" });
      const page = await first;
      const more = page.kind === "done" ? page.value.more : undefined;
      void scene.client.messaging.readList("conversations", more);
      expect(scene.tunnel.lastOf("msg-read")).toMatchObject({
        what: "conversations",
        cursor: "40",
      });
    });

    it("reads a conversation's older messages with before", () => {
      const scene = new GatewayScene();
      scene.connect();
      void scene.client.messaging.readMessages("c1", "20");
      expect(scene.tunnel.lastOf("msg-read")).toMatchObject({
        what: "messages",
        conversation: "c1",
        before: "20",
      });
    });

    it("sends an answer confirmed and settles it by its result", async () => {
      const scene = new GatewayScene();
      scene.connect();
      const answer = requests["msg-answer"]?.(scene.client.messaging);
      const sent = scene.tunnel.lastOf("msg-answer");
      expect(sent.confirmed).toBe(true);
      const result = { outcome: "answered", answeredAt: "2026-11-25T10:01:00.000Z" } as const;
      scene.host({ type: "msg-result", replyTo: sent.id, result });
      expect(await answer).toEqual({ kind: "done", value: result });
    });

    it.each([
      "not-allowed-from-phone",
      "offline",
      "signed-out",
      "not-found",
      "not-supported",
    ] as const)("settles each request refused with %s and keeps the connection", async (code) => {
      const scene = new GatewayScene();
      scene.connect();
      for (const [type, request] of Object.entries(requests)) {
        const outcome = request(scene.client.messaging);
        const replyTo = onlyId(scene, type as "msg-read");
        scene.host({ type: "error", replyTo, code });
        expect(await outcome).toEqual({ kind: "refused", code });
      }
      expect(scene.tunnel.ended).toEqual([]);
    });

    it("sends no blank message and no to that names someone outside the conversation", async () => {
      const scene = new GatewayScene();
      scene.connect();
      const { messaging } = scene.client;
      expect(await messaging.send(channel, " ")).toEqual({ kind: "not-sent", reason: "invalid" });
      expect(await messaging.send(channel, "x".repeat(10_001))).toMatchObject({ kind: "not-sent" });
      expect(await messaging.send(channel, "Hi", ["stranger"])).toMatchObject({ kind: "not-sent" });
      expect(await messaging.search("")).toMatchObject({ kind: "not-sent" });
      expect(scene.tunnel.sentOf("msg-send")).toEqual([]);
    });
  });

  describe("what ends the session", () => {
    it("ends it on a msg-data with an extra key", () => {
      const scene = new GatewayScene();
      scene.connect();
      void scene.client.messaging.readList("inbox");
      const replyTo = scene.tunnel.lastOf("msg-read").id;
      scene.host(JSON.stringify({ type: "msg-data", replyTo, what: "inbox", items: [], extra: 1 }));
      expect(scene.tunnel.ended).toEqual([1]);
    });

    it("ends it on a msg-data for nothing the phone asked, or for another list", async () => {
      const scene = new GatewayScene();
      scene.connect();
      scene.host({ type: "msg-data", replyTo: "p-99", what: "inbox", items: [] });
      expect(scene.tunnel.ended).toEqual([1]);
      scene.connect();
      const read = scene.client.messaging.readList("inbox");
      const replyTo = scene.tunnel.lastOf("msg-read").id;
      scene.host({ type: "msg-data", replyTo, what: "work", items: [] });
      expect(scene.tunnel.ended).toEqual([1, 2]);
      expect(await read).toEqual({ kind: "cut-off" });
    });

    it("ends it on an ok to a read, and settles the read as cut off", async () => {
      const scene = new GatewayScene();
      scene.connect();
      const read = scene.client.messaging.readList("inbox");
      scene.ok(scene.tunnel.lastOf("msg-read").id);
      expect(scene.tunnel.ended).toEqual([1]);
      expect(await read).toEqual({ kind: "cut-off" });
    });

    it("ends it on a msg-changed while it doesn't watch", () => {
      const scene = new GatewayScene();
      scene.connect();
      scene.host({ type: "msg-changed", source: "acme" });
      expect(scene.tunnel.ended).toEqual([1]);
    });

    it("takes a msg-changed while it watches, and watches again on the next session", () => {
      const scene = new GatewayScene();
      scene.connect();
      const changed: string[] = [];
      scene.client.messaging.watch((source) => changed.push(source));
      scene.ok(scene.tunnel.lastOf("msg-watch").id);
      scene.host({ type: "msg-changed", source: "acme" });
      expect(changed).toEqual(["acme"]);
      expect(scene.tunnel.ended).toEqual([]);
      scene.client.messaging.watch((source) => changed.push(`again ${source}`));
      expect(scene.tunnel.sentOf("msg-watch")).toHaveLength(1);
      scene.drop();
      scene.connect();
      expect(scene.tunnel.sentOf("msg-watch")).toHaveLength(2);
    });

    it("watches again after the unwatch's ok when asked while it waited", () => {
      const scene = new GatewayScene();
      scene.connect();
      const stop = scene.client.messaging.watch(() => undefined);
      scene.ok(scene.tunnel.lastOf("msg-watch").id);
      stop();
      scene.client.messaging.watch(() => undefined);
      expect(scene.tunnel.sentOf("msg-watch")).toHaveLength(1);
      scene.ok(scene.tunnel.lastOf("msg-unwatch").id);
      expect(scene.tunnel.sentOf("msg-watch")).toHaveLength(2);
    });
  });

  describe("drops and older computers", () => {
    it("settles a write cut off by a drop and never sends it again", async () => {
      const scene = new GatewayScene();
      scene.connect();
      const send = scene.client.messaging.send(channel, "Ship it");
      scene.drop();
      expect(await send).toEqual({ kind: "cut-off" });
      scene.connect();
      expect(scene.tunnel.sentOf("msg-send")).toHaveLength(1);
    });

    it("sends nothing while the computer speaks only version 3", async () => {
      const scene = new GatewayScene();
      scene.connectAt(gatewayFallbackProtocolVersion);
      expect(scene.client.view().olderComputer).toBe(true);
      const { messaging } = scene.client;
      messaging.watch(() => undefined);
      for (const request of Object.values(requests)) {
        expect(await request(messaging)).toEqual({ kind: "not-sent", reason: "off" });
      }
      const types = scene.tunnel.sent.map((sent) => sent.message.type);
      expect(types.filter((type) => type.startsWith("msg-"))).toEqual([]);
    });
  });
});
