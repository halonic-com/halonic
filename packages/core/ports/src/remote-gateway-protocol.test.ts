import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  type GatewayClientMessage,
  type GatewayHostMessage,
  gatewayClosingErrorCodes,
  gatewayErrorCodes,
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
      "hello" | "list-sessions" | "watch" | "unwatch" | "answer-approval" | "prompt"
    >();
    // @ts-expect-error: a phone can't ask the host to run a command
    const shell: GatewayClientMessage = { type: "run-command", id: "1", command: "ls" };
    // @ts-expect-error: nor read a secret
    const secret: GatewayClientMessage = { type: "read-secret", id: "2", name: "KEY" };
    expectTypeOf([shell, secret]).toEqualTypeOf<GatewayClientMessage[]>();
  });

  typeTest("lets the host send only these messages", () => {
    expectTypeOf<GatewayHostMessage["type"]>().toEqualTypeOf<
      "welcome" | "sessions" | "event" | "ok" | "error"
    >();
  });

  it("is version 1, with a 64 KiB limit per message", () => {
    expect(gatewayProtocolVersion).toBe(1);
    expect(gatewayMaxMessageBytes).toBe(65_536);
    expect(gatewayErrorCodes).toContain("too-large");
    expect(gatewayErrorCodes).toContain("not-allowed-remotely");
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
