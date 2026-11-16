import {
  gatewayMaxBufferedBytes,
  gatewayMaxMessageBytes,
  gatewayMaxWatches,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { openConnection, settle } from "./connection.test-helper.ts";

const risky = {
  type: "approval-requested",
  approval: { id: "p1", summary: "Run ls", risk: "risky" },
} as const;
const normal = {
  type: "approval-requested",
  approval: { id: "p2", summary: "Read a page", risk: "normal" },
} as const;

verifies("remote-gateway.connection", () => {
  describe("the first message", () => {
    it("answers hello with welcome", async () => {
      const t = openConnection();
      await t.hello();
      expect(t.sent).toEqual([
        { type: "welcome", replyTo: "h1", version: 1, maxMessageBytes: gatewayMaxMessageBytes },
      ]);
    });

    it("closes with malformed on any message before hello", async () => {
      const t = openConnection();
      await t.say({ type: "list-sessions", id: "l1" });
      expect(t.sent).toEqual([{ type: "error", code: "malformed" }]);
      expect(t.transport.closed).toBe(true);
    });

    it("closes with malformed on a second hello", async () => {
      const t = openConnection();
      await t.hello();
      await t.hello();
      expect(t.sent.at(-1)).toEqual({ type: "error", code: "malformed" });
      expect(t.transport.closed).toBe(true);
    });

    it("closes with unsupported-version on another version, without a replyTo", async () => {
      const t = openConnection();
      await t.say({ type: "hello", id: "h1", version: 2 });
      expect(t.sent).toEqual([{ type: "error", code: "unsupported-version" }]);
      expect(t.transport.closed).toBe(true);
    });

    it("handles nothing that arrives after it closed", async () => {
      const t = openConnection();
      await t.say("garbage");
      await t.hello();
      expect(t.sent).toHaveLength(1);
    });
  });

  describe("bad frames", () => {
    it("closes on a frame over 64 KiB with too-large", async () => {
      const t = openConnection();
      await t.hello();
      t.connection.receive({ binary: false, bytes: new Uint8Array(gatewayMaxMessageBytes + 1) });
      await settle();
      expect(t.sent.at(-1)).toEqual({ type: "error", code: "too-large" });
      expect(t.transport.closed).toBe(true);
    });

    it("closes on a binary frame with malformed", async () => {
      const t = openConnection();
      await t.hello();
      t.connection.receive({ binary: true, bytes: Uint8Array.of(1, 2) });
      await settle();
      expect(t.sent.at(-1)).toEqual({ type: "error", code: "malformed" });
    });
  });

  describe("sessions and watching", () => {
    it("lists the sessions", async () => {
      const t = openConnection();
      t.source.addSession("s1");
      await t.hello();
      await t.say({ type: "list-sessions", id: "l1" });
      expect(t.sent.at(-1)).toMatchObject({
        type: "sessions",
        replyTo: "l1",
        sessions: [{ id: "s1" }],
      });
    });

    it("says ok, then streams the events after afterSeq and each new one", async () => {
      const t = openConnection();
      t.source.addSession("s1");
      t.source.emit("s1", { type: "message", role: "user", text: "one" });
      t.source.emit("s1", { type: "message", role: "agent", text: "two" });
      await t.hello();
      await t.say({ type: "watch", id: "w1", sessionId: "s1", afterSeq: 1 });
      t.source.emit("s1", { type: "state", state: "done" });
      await settle();
      expect(t.sent.slice(1).map((m) => (m.type === "event" ? `event ${m.seq}` : m.type))).toEqual([
        "ok",
        "event 2",
        "event 3",
      ]);
    });

    it("refuses an unknown session and keeps the connection", async () => {
      const t = openConnection();
      await t.hello();
      await t.say({ type: "watch", id: "w1", sessionId: "nope", afterSeq: 0 });
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "w1", code: "unknown-session" });
      expect(t.transport.closed).toBe(false);
    });

    it("closes with malformed on an afterSeq above the session's lastSeq", async () => {
      const t = openConnection();
      t.source.addSession("s1");
      await t.hello();
      await t.say({ type: "watch", id: "w1", sessionId: "s1", afterSeq: 1 });
      expect(t.sent.at(-1)).toEqual({ type: "error", code: "malformed" });
      expect(t.transport.closed).toBe(true);
    });

    it("answers history-gone when the events are gone, and keeps the connection", async () => {
      const t = openConnection();
      t.source.addSession("s1");
      for (let n = 0; n < 5; n++) t.source.emit("s1", { type: "state", state: "running" });
      t.source.forgetBefore("s1", 4);
      await t.hello();
      await t.say({ type: "watch", id: "w1", sessionId: "s1", afterSeq: 1 });
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "w1", code: "history-gone" });
      await t.say({ type: "watch", id: "w2", sessionId: "s1", afterSeq: 0 });
      expect(t.sent.at(-1)).toMatchObject({ type: "event", seq: 5 });
      expect(t.transport.closed).toBe(false);
    });

    it("replaces a second watch of the same session", async () => {
      const t = openConnection();
      t.source.addSession("s1");
      await t.hello();
      await t.say({ type: "watch", id: "w1", sessionId: "s1", afterSeq: 0 });
      await t.say({ type: "watch", id: "w2", sessionId: "s1", afterSeq: 0 });
      expect(t.source.watcherCount("s1")).toBe(1);
    });

    it("stops watching on unwatch, and refuses unwatch of a session not watched", async () => {
      const t = openConnection();
      t.source.addSession("s1");
      await t.hello();
      await t.say({ type: "watch", id: "w1", sessionId: "s1", afterSeq: 0 });
      await t.say({ type: "unwatch", id: "u1", sessionId: "s1" });
      expect(t.sent.at(-1)).toEqual({ type: "ok", replyTo: "u1" });
      expect(t.source.watcherCount("s1")).toBe(0);
      await t.say({ type: "unwatch", id: "u2", sessionId: "s1" });
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "u2", code: "unknown-session" });
    });

    it("allows 16 watches and refuses the 17th with too-many-watches", async () => {
      const t = openConnection();
      await t.hello();
      for (let n = 0; n <= gatewayMaxWatches; n++) t.source.addSession(`s${n}`);
      for (let n = 0; n < gatewayMaxWatches; n++) {
        await t.say({ type: "watch", id: `w${n}`, sessionId: `s${n}`, afterSeq: 0 });
      }
      await t.say({ type: "watch", id: "w-last", sessionId: `s${gatewayMaxWatches}`, afterSeq: 0 });
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "w-last", code: "too-many-watches" });
      // Watching one of the 16 again replaces it, and so is not one more.
      await t.say({ type: "watch", id: "w-again", sessionId: "s0", afterSeq: 0 });
      expect(t.sent.at(-1)).toEqual({ type: "ok", replyTo: "w-again" });
    });

    it("stops every watch when the connection closes", async () => {
      const t = openConnection();
      t.source.addSession("s1");
      await t.hello();
      await t.say({ type: "watch", id: "w1", sessionId: "s1", afterSeq: 0 });
      t.connection.close();
      expect(t.source.watcherCount("s1")).toBe(0);
    });

    it("shortens a message text that would make its event too large", async () => {
      const t = openConnection();
      t.source.addSession("s1");
      t.source.emit("s1", { type: "message", role: "agent", text: "😀".repeat(40_000) });
      await t.hello();
      await t.say({ type: "watch", id: "w1", sessionId: "s1", afterSeq: 0 });
      const event = t.sent.at(-1);
      expect(event).toMatchObject({ type: "event", seq: 1 });
      const text = event?.type === "event" && event.body.type === "message" ? event.body.text : "";
      expect(text.endsWith("…")).toBe(true);
      expect(new TextEncoder().encode(JSON.stringify(event)).byteLength).toBeLessThanOrEqual(
        gatewayMaxMessageBytes,
      );
      expect(text.slice(0, -1)).toMatch(/^(😀)+$/u);
    });

    it("closes rather than leave a gap when an event can't be made to fit", async () => {
      const t = openConnection();
      t.source.addSession("s1");
      t.source.emit("s1", {
        type: "approval-requested",
        approval: { id: "p1", summary: "x".repeat(70_000), risk: "normal" },
      });
      await t.hello();
      await t.say({ type: "watch", id: "w1", sessionId: "s1", afterSeq: 0 });
      expect(t.transport.closed).toBe(true);
    });

    it("closes a phone that reads too slowly", async () => {
      const t = openConnection();
      t.source.addSession("s1");
      await t.hello();
      await t.say({ type: "watch", id: "w1", sessionId: "s1", afterSeq: 0 });
      t.transport.buffered = gatewayMaxBufferedBytes + 1;
      t.source.emit("s1", { type: "state", state: "done" });
      await settle();
      expect(t.transport.closed).toBe(true);
      expect(t.source.watcherCount("s1")).toBe(0);
    });
  });

  describe("approvals", () => {
    it("passes a normal approval's answer on", async () => {
      const t = openConnection();
      t.source.addSession("s1");
      t.source.emit("s1", normal);
      await t.hello();
      await t.say({
        type: "answer-approval",
        id: "a1",
        sessionId: "s1",
        approvalId: "p2",
        decision: "approve",
      });
      expect(t.sent.at(-1)).toEqual({ type: "ok", replyTo: "a1" });
      expect(t.source.answers).toEqual([{ approvalId: "p2", decision: "approve" }]);
    });

    it("refuses an answer to a risky approval by default, and passes nothing on", async () => {
      const t = openConnection();
      t.source.addSession("s1");
      t.source.emit("s1", risky);
      await t.hello();
      await t.say({
        type: "answer-approval",
        id: "a1",
        sessionId: "s1",
        approvalId: "p1",
        decision: "approve",
      });
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "a1", code: "not-allowed-remotely" });
      expect(t.source.answers).toEqual([]);
      expect(t.transport.closed).toBe(false);
    });

    it("passes a risky approval's answer on once the person allowed it on the desktop", async () => {
      const t = openConnection({ allowRisky: true });
      t.source.addSession("s1");
      t.source.emit("s1", risky);
      await t.hello();
      await t.say({
        type: "answer-approval",
        id: "a1",
        sessionId: "s1",
        approvalId: "p1",
        decision: "deny",
      });
      expect(t.sent.at(-1)).toEqual({ type: "ok", replyTo: "a1" });
    });

    it("answers unknown-approval for an unknown or settled approval, or one settled meanwhile", async () => {
      const t = openConnection();
      t.source.addSession("s1");
      t.source.emit("s1", normal);
      await t.hello();
      const answer = (id: string, approvalId: string) =>
        t.say({ type: "answer-approval", id, sessionId: "s1", approvalId, decision: "approve" });
      await answer("a1", "nope");
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "a1", code: "unknown-approval" });
      t.source.failAnswers = true;
      await answer("a2", "p2");
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "a2", code: "unknown-approval" });
    });
  });

  describe("prompts", () => {
    it("passes a prompt on to its session", async () => {
      const t = openConnection();
      t.source.addSession("s1");
      await t.hello();
      await t.say({ type: "prompt", id: "p1", sessionId: "s1", text: "go on" });
      expect(t.sent.at(-1)).toEqual({ type: "ok", replyTo: "p1" });
      expect(t.source.prompts).toEqual([{ sessionId: "s1", text: "go on" }]);
    });

    it("refuses a prompt for an unknown session", async () => {
      const t = openConnection();
      await t.hello();
      await t.say({ type: "prompt", id: "p1", sessionId: "nope", text: "go on" });
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "p1", code: "unknown-session" });
    });

    it("refuses a prompt its session can't take", async () => {
      const t = openConnection();
      t.source.addSession("s1");
      t.source.sendPrompt = async () => {
        throw new Error("finished");
      };
      await t.hello();
      await t.say({ type: "prompt", id: "p1", sessionId: "s1", text: "go on" });
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "p1", code: "unknown-session" });
    });
  });

  it("closes the connection when the source throws", async () => {
    const t = openConnection();
    t.source.list = () => {
      throw new Error("boom");
    };
    await t.hello();
    await t.say({ type: "list-sessions", id: "l1" });
    expect(t.transport.closed).toBe(true);
  });
});
