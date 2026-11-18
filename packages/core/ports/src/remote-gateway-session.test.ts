import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  decodeCleartextFrame,
  encodeCleartextFrame,
  type GatewayCleartextFrame,
  gatewayFrameKinds,
  gatewayMaxFrameBytes,
  gatewayMaxHandshakeBytes,
  gatewayMaxNameBytes,
  gatewayNoisePrologue,
  gatewayPairingPattern,
  gatewayReconnectPattern,
  gatewaySessionLimits,
  pairCommitInput,
  pairCommitNonceBytes,
  pairingRules,
} from "./remote-gateway-session.ts";

verifies("ports.remote-gateway-session", () => {
  it("pairs with XXpsk3 and reconnects with IK, with version 2 in the prologue", () => {
    expect(gatewayPairingPattern).toBe("Noise_XXpsk3_25519_ChaChaPoly_SHA256");
    expect(gatewayReconnectPattern).toBe("Noise_IK_25519_ChaChaPoly_SHA256");
    expect(gatewayNoisePrologue).toBe("halonic-gateway/2");
  });

  it("gives each frame kind its own byte", () => {
    const bytes = Object.values(gatewayFrameKinds);
    expect(new Set(bytes).size).toBe(bytes.length);
    expect(gatewayFrameKinds["handshake-failed"]).toBe(0x30);
    expect(gatewayFrameKinds["pair-refused"]).toBe(0x31);
  });

  it("limits frames, handshakes and names", () => {
    expect(gatewayMaxFrameBytes).toBe(65_536);
    expect(gatewayMaxHandshakeBytes).toBe(1_024);
    expect(gatewayMaxNameBytes).toBe(64);
    // Pairing message 3: the phone's key and its tag, and a payload with the longest name and the nonce.
    const payload = JSON.stringify({
      name: "n".repeat(gatewayMaxNameBytes),
      platform: "android",
      nonce: "x".repeat(22),
    });
    expect(32 + 16 + payload.length + 16).toBeLessThan(gatewayMaxHandshakeBytes);
    // Pairing message 1: the phone's ephemeral key and the commitment in cleartext.
    const commit = JSON.stringify({ commit: "x".repeat(43) });
    expect(32 + commit.length).toBeLessThan(gatewayMaxHandshakeBytes);
  });

  it("builds the commitment's input from the label, the phone's key and message 3's payload", () => {
    const key = new Uint8Array(32).fill(7);
    const payload = new TextEncoder().encode('{"name":"Pixel","platform":"android","nonce":"AA"}');
    const input = pairCommitInput(key, payload);
    const label = new TextEncoder().encode("halonic pair commit v1");
    expect([...input]).toEqual([...label, ...key, ...payload]);
    expect(pairCommitNonceBytes).toBe(16);
    expect(() => pairCommitInput(new Uint8Array(31), payload)).toThrow(RangeError);
    expect(() => pairCommitInput(new Uint8Array(33), payload)).toThrow(RangeError);
  });

  it("keeps the pairing rules of the build plan", () => {
    expect(pairingRules).toEqual({
      codeLifetimeMs: 300_000,
      allowWaitMs: 120_000,
      wrongTriesPerCode: 5,
      failedTriesPerMinute: 10,
    });
  });

  it("rekeys every 10,000 messages or 30 minutes and ends a session after a day", () => {
    expect(gatewaySessionLimits).toEqual({
      handshakeTimeoutMs: 10_000,
      rekeyAfterMs: 1_800_000,
      rekeyAfterMessages: 10_000,
      sessionMaxMs: 86_400_000,
    });
  });

  const frames: [GatewayCleartextFrame, number[]][] = [
    [{ kind: "handshake-failed" }, [0x30]],
    [{ kind: "pair-refused", reason: "wrong-code", triesLeft: 4 }, [0x31, 0, 4]],
    [{ kind: "pair-refused", reason: "wrong-code", triesLeft: 1 }, [0x31, 0, 1]],
    [{ kind: "pair-refused", reason: "code-ended", triesLeft: 0 }, [0x31, 1, 0]],
    [{ kind: "pair-refused", reason: "code-used", triesLeft: 0 }, [0x31, 2, 0]],
    [{ kind: "pair-refused", reason: "rate-limited", triesLeft: 0 }, [0x31, 3, 0]],
  ];

  it.each(frames)("writes and reads %j as fixed bytes", (frame, bytes) => {
    expect([...encodeCleartextFrame(frame)]).toEqual(bytes);
    expect(decodeCleartextFrame(Uint8Array.from(bytes))).toEqual(frame);
  });

  it.each([
    { reason: "wrong-code", triesLeft: 0 },
    { reason: "wrong-code", triesLeft: 5 },
    { reason: "wrong-code", triesLeft: 2.5 },
    { reason: "code-used", triesLeft: 1 },
  ] as const)("refuses to write %j", ({ reason, triesLeft }) => {
    expect(() => encodeCleartextFrame({ kind: "pair-refused", reason, triesLeft })).toThrow(
      RangeError,
    );
  });

  it.each([
    [],
    [0x30, 0],
    [0x31],
    [0x31, 0],
    [0x31, 0, 4, 0],
    [0x31, 4, 0],
    [0x31, 0, 0],
    [0x31, 0, 5],
    [0x31, 1, 1],
    [0x20, 0, 0],
  ])("reads %j as no cleartext frame", (...bytes) => {
    expect(decodeCleartextFrame(Uint8Array.from(bytes))).toBeUndefined();
  });
});
