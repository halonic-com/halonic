import {
  type GatewayHostMessage,
  gatewayMaxMessageBytes,
  gatewayProtocolVersion,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { parseHostMessage } from "./host-message.ts";

const session = {
  id: "s-1",
  title: "Weekly report",
  state: "waiting",
  lastSeq: 4,
  updatedAt: "2026-11-21T14:02:00.000Z",
} as const;

const approval = { id: "a-1", summary: "Send 4 replies", risk: "normal" } as const;

/** An event of session `s-1` with `body`. */
function event(body: object): object {
  return { type: "event", sessionId: "s-1", seq: 5, at: "2026-11-21T14:02:00.000Z", body };
}

const valid: readonly GatewayHostMessage[] = [
  { type: "welcome", replyTo: "p-1", version: gatewayProtocolVersion, maxMessageBytes: 65_519 },
  { type: "sessions", replyTo: "p-2", sessions: [session] },
  { type: "sessions", replyTo: "p-2", sessions: [] },
  event({
    type: "message",
    role: "agent",
    text: "Writing the weekly report",
  }) as GatewayHostMessage,
  event({ type: "state", state: "done" }) as GatewayHostMessage,
  event({ type: "approval-requested", approval }) as GatewayHostMessage,
  event({
    type: "approval-requested",
    approval: { ...approval, risk: "risky", connector: "mail" },
  }) as GatewayHostMessage,
  event({ type: "approval-settled", approvalId: "a-1", decision: "deny" }) as GatewayHostMessage,
  { type: "ok", replyTo: "p-3" },
  { type: "paired" },
  { type: "pair-refused", reason: "timed-out" },
  { type: "not-paired" },
  { type: "error", code: "malformed" },
  { type: "error", replyTo: "p-4", code: "history-gone" },
];

function problemOf(text: string): string | undefined {
  const result = parseHostMessage(text);
  return result.ok ? undefined : result.problem;
}

/** A `message` event whose JSON takes exactly `bytes` bytes. */
function eventOfBytes(bytes: number): string {
  const empty = JSON.stringify(event({ type: "message", role: "agent", text: "" }));
  const padding = bytes - new TextEncoder().encode(empty).byteLength;
  // "é" takes two bytes, so the size is counted in UTF-8, not in characters.
  const text = "é".repeat(Math.floor(padding / 2)) + "x".repeat(padding % 2);
  return JSON.stringify(event({ type: "message", role: "agent", text }));
}

verifies("remote.phone-host-messages", () => {
  it("reads every valid message unchanged", () => {
    for (const message of valid) {
      expect(parseHostMessage(JSON.stringify(message))).toEqual({ ok: true, message });
    }
  });

  describe("the size comes first", () => {
    it("reads a message of the largest size and refuses one byte more", () => {
      expect(problemOf(eventOfBytes(gatewayMaxMessageBytes))).toBeUndefined();
      expect(problemOf(eventOfBytes(gatewayMaxMessageBytes + 1))).toBe("too-large");
    });

    it("refuses a large text that isn't even JSON as too-large, not malformed", () => {
      expect(problemOf("{".repeat(gatewayMaxMessageBytes + 1))).toBe("too-large");
    });
  });

  it("refuses text that isn't exactly one JSON object", () => {
    const welcome = JSON.stringify(valid[0]);
    for (const text of [
      "[]",
      "null",
      "42",
      '"ok"',
      `${welcome}${welcome}`,
      `\uFEFF${welcome}`,
      "",
    ]) {
      expect(problemOf(text), text).toBe("malformed");
    }
  });

  it("refuses a type the protocol doesn't list", () => {
    for (const type of ["run-command", "hello", "toString", "__proto__", "constructor"]) {
      expect(problemOf(JSON.stringify({ type, replyTo: "p-1" })), type).toBe("malformed");
    }
    expect(problemOf('{"replyTo":"p-1"}')).toBe("malformed");
    expect(problemOf('{"type":7}')).toBe("malformed");
  });

  it("refuses a missing, extra or wrongly typed field at every level", () => {
    const wrong: readonly object[] = [
      { type: "ok" },
      { type: "ok", replyTo: "p-1", extra: true },
      { type: "ok", replyTo: 1 },
      { type: "ok", replyTo: "has space" },
      { type: "ok", replyTo: "x".repeat(129) },
      { type: "paired", replyTo: "p-1" },
      { type: "sessions", replyTo: "p-1", sessions: {} },
      { type: "sessions", replyTo: "p-1", sessions: [{ ...session, title: undefined }] },
      { type: "sessions", replyTo: "p-1", sessions: [{ ...session, state: "paused" }] },
      { type: "sessions", replyTo: "p-1", sessions: [{ ...session, lastSeq: -1 }] },
      { type: "sessions", replyTo: "p-1", sessions: [{ ...session, lastSeq: 1.5 }] },
      { ...event({ type: "state", state: "done" }), extra: 1 },
      { ...event({ type: "state", state: "done" }), seq: 0 },
      { ...event({ type: "state", state: "done" }), seq: "5" },
      event({ type: "state", state: "done", extra: 1 }),
      event({ type: "message", role: "system", text: "hi" }),
      event({ type: "message", role: "agent" }),
      event({ type: "approval-requested", approval: { ...approval, risk: "low" } }),
      event({ type: "approval-requested", approval: { ...approval, connector: 3 } }),
      event({ type: "approval-requested", approval: { ...approval, run: "rm -rf" } }),
      event({ type: "approval-settled", approvalId: "a-1", decision: "maybe" }),
      event({ type: "toString" }),
      event([]),
      { type: "welcome", replyTo: "p-1", version: gatewayProtocolVersion, maxMessageBytes: 0 },
      { type: "welcome", replyTo: "p-1", version: gatewayProtocolVersion },
      { type: "pair-refused", reason: "wrong-code" },
    ];
    for (const message of wrong) {
      const text = JSON.stringify(message);
      expect(problemOf(text), text).toBe("malformed");
    }
  });

  it("takes a __proto__ field as an extra field", () => {
    expect(problemOf('{"type":"ok","replyTo":"p-1","__proto__":{}}')).toBe("malformed");
  });

  it("refuses an error that mixes the closing and the refusing shape", () => {
    expect(problemOf('{"type":"error","replyTo":"p-1","code":"malformed"}')).toBe("malformed");
    expect(problemOf('{"type":"error","code":"history-gone"}')).toBe("malformed");
  });

  it("refuses a welcome of another version, whatever else it holds", () => {
    expect(problemOf(JSON.stringify({ type: "welcome", version: 3, features: [] }))).toBe(
      "other-version",
    );
    expect(problemOf(JSON.stringify({ type: "welcome", replyTo: "p-1", version: "2" }))).toBe(
      "malformed",
    );
  });
});
