import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { PhoneMessaging } from "./remote-gateway-messaging.ts";
import {
  type GatewayClientMessage,
  type GatewayHostMessage,
  gatewayClosingErrorCodes,
  gatewayErrorCodes,
  gatewayFallbackProtocolVersion,
  gatewayMaxBufferedBytes,
  gatewayMaxIdLength,
  gatewayMaxMessageBytes,
  gatewayMaxPromptLength,
  gatewayMaxWatches,
  gatewayProtocolVersion,
  gatewayRefusalCodes,
} from "./remote-gateway-protocol.ts";

verifies("ports.remote-gateway-protocol", () => {
  typeTest("lets a phone send only sessions, approvals and prompts", () => {
    expectTypeOf<GatewayClientMessage["type"]>().toEqualTypeOf<
      | "hello"
      | "list-sessions"
      | "watch"
      | "unwatch"
      | "answer-approval"
      | "prompt"
      | "msg-read"
      | "msg-search"
      | "msg-answer"
      | "msg-send"
      | "msg-watch"
      | "msg-unwatch"
      | "team-read"
    >();
    // @ts-expect-error: a phone can't ask the host to run a command
    const shell: GatewayClientMessage = { type: "run-command", id: "1", command: "ls" };
    // @ts-expect-error: nor read a secret
    const secret: GatewayClientMessage = { type: "read-secret", id: "2", name: "KEY" };
    expectTypeOf([shell, secret]).toEqualTypeOf<GatewayClientMessage[]>();
  });

  typeTest("lets the host send only these messages", () => {
    expectTypeOf<GatewayHostMessage["type"]>().toEqualTypeOf<
      | "welcome"
      | "sessions"
      | "event"
      | "ok"
      | "error"
      | "paired"
      | "pair-refused"
      | "not-paired"
      | "msg-data"
      | "msg-result"
      | "msg-changed"
      | "team-data"
    >();
  });

  typeTest("sends an answer to an inbox item only confirmed, and never a stepper's result", () => {
    const answer = {
      type: "msg-answer",
      id: "a",
      item: "i",
      answer: { kind: "reply", text: "ok" },
    };
    // @ts-expect-error: an answer the phone's owner check didn't confirm
    const unconfirmed: GatewayClientMessage = { ...answer, confirmed: false };
    const stepper: GatewayClientMessage = {
      ...answer,
      confirmed: true,
      // @ts-expect-error: an action item's stepper runs only on the desktop
      answer: { kind: "action-result", result: {} },
    };
    // @ts-expect-error: the phone can't start a channel
    const start: GatewayClientMessage = { type: "msg-start-channel", id: "s" };
    expectTypeOf([unconfirmed, stepper, start]).toEqualTypeOf<GatewayClientMessage[]>();
  });

  it("is message version 4, with one Noise transport message less its tag per message", () => {
    expect(gatewayProtocolVersion).toBe(4);
    expect(gatewayFallbackProtocolVersion).toBe(3);
    expect(gatewayRefusalCodes).toContain("not-allowed-from-phone");
    expect(gatewayMaxMessageBytes).toBe(65_519);
    expect(gatewayErrorCodes).toContain("too-large");
    expect(gatewayErrorCodes).toContain("not-allowed-remotely");
  });

  it("refuses a search or send over the phone's rate with its own code, the connection left open", () => {
    expect(gatewayRefusalCodes).toContain("rate-limited");
    expect(gatewayClosingErrorCodes).not.toContain("rate-limited");
  });

  typeTest("gives the phone only the allowed port members, none that changes a channel", () => {
    expectTypeOf<keyof PhoneMessaging>().toEqualTypeOf<
      | "listSources"
      | "listAgents"
      | "listConversations"
      | "listMessages"
      | "listInboxItems"
      | "listWork"
      | "search"
      | "answer"
      | "send"
      | "changes"
      | "team"
    >();
    expectTypeOf<keyof PhoneMessaging["team"]>().toEqualTypeOf<
      "parts" | "spend" | "seats" | "pullRequests" | "pullRequest" | "mergeQueue" | "changes"
    >();
  });

  typeTest("lists sessions with the risky switch, as an answer or as a push", () => {
    const answer: GatewayHostMessage = {
      type: "sessions",
      replyTo: "p-2",
      sessions: [],
      answersRisky: false,
    };
    const pushed: GatewayHostMessage = { type: "sessions", sessions: [], answersRisky: true };
    // @ts-expect-error: since version 3 it always says whether risky answers are on
    const withoutSwitch: GatewayHostMessage = { type: "sessions", replyTo: "p-2", sessions: [] };
    expectTypeOf([answer, pushed, withoutSwitch]).toEqualTypeOf<GatewayHostMessage[]>();
  });

  it("sets limits the attack suite can test", () => {
    expect(gatewayMaxIdLength).toBe(128);
    expect(gatewayMaxWatches).toBe(16);
    expect(gatewayMaxBufferedBytes).toBe(1_048_576);
    expect(gatewayClosingErrorCodes).toEqual(["malformed", "too-large", "unsupported-version"]);
    expect(gatewayErrorCodes).toEqual([...gatewayClosingErrorCodes, ...gatewayRefusalCodes]);
    expect(gatewayRefusalCodes).toContain("too-many-watches");
  });

  const promptBytes = (text: string) => {
    const prompt: GatewayClientMessage = {
      type: "prompt",
      id: "i".repeat(gatewayMaxIdLength),
      sessionId: "s".repeat(gatewayMaxIdLength),
      text,
    };
    return new TextEncoder().encode(JSON.stringify(prompt)).byteLength;
  };

  it("fits the longest prompt in one message even when JSON writes each unit in six bytes", () => {
    expect(JSON.stringify("\u0001")).toBe('"\\u0001"');
    expect(promptBytes("\u0001".repeat(gatewayMaxPromptLength))).toBeLessThanOrEqual(
      gatewayMaxMessageBytes,
    );
    expect(promptBytes("\ud800".repeat(gatewayMaxPromptLength))).toBeLessThanOrEqual(
      gatewayMaxMessageBytes,
    );
    expect(promptBytes("€".repeat(gatewayMaxPromptLength))).toBeLessThanOrEqual(
      gatewayMaxMessageBytes,
    );
    expect(promptBytes("\u0001".repeat(16_000))).toBeGreaterThan(gatewayMaxMessageBytes);
  });

  typeTest("closes without a replyTo and refuses with one", () => {
    const closing: GatewayHostMessage = { type: "error", code: "malformed" };
    const refusal: GatewayHostMessage = {
      type: "error",
      replyTo: "7",
      code: "not-allowed-remotely",
    };
    // @ts-expect-error: a closing error answers a message that may not have parsed
    const trusted: GatewayHostMessage = { type: "error", replyTo: "7", code: "malformed" };
    // @ts-expect-error: a refusal names the message it refuses
    const orphan: GatewayHostMessage = { type: "error", code: "history-gone" };
    expectTypeOf([closing, refusal, trusted, orphan]).toEqualTypeOf<GatewayHostMessage[]>();
  });

  typeTest("ends a pairing inside the session only as denied or timed out", () => {
    const denied: GatewayHostMessage = { type: "pair-refused", reason: "denied" };
    // @ts-expect-error: a wrong code is refused in cleartext, before the session exists
    const wrong: GatewayHostMessage = { type: "pair-refused", reason: "wrong-code" };
    expectTypeOf([denied, wrong]).toEqualTypeOf<GatewayHostMessage[]>();
  });

  typeTest("lets only the host set an approval's risk", () => {
    const answer: GatewayClientMessage = {
      type: "answer-approval",
      id: "8",
      sessionId: "s1",
      approvalId: "a1",
      decision: "approve",
      // @ts-expect-error: the phone can't say how risky an approval is
      risk: "normal",
    };
    expectTypeOf(answer).toEqualTypeOf<GatewayClientMessage>();
  });
});
