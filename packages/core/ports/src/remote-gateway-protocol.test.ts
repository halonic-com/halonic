import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  type GatewayClientMessage,
  type GatewayHostMessage,
  gatewayErrorCodes,
  gatewayMaxMessageBytes,
  gatewayMaxPromptLength,
  gatewayProtocolVersion,
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

  it("fits the longest prompt of three-byte characters in one message", () => {
    const prompt: GatewayClientMessage = {
      type: "prompt",
      id: "a-message-id-of-some-length",
      sessionId: "a-session-id-of-some-length",
      text: "€".repeat(gatewayMaxPromptLength),
    };
    const bytes = new TextEncoder().encode(JSON.stringify(prompt)).byteLength;
    expect(bytes).toBeLessThan(gatewayMaxMessageBytes);
  });
});
