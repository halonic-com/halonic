import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  codeEndReasons,
  type PairedPhone,
  type PairingEvent,
  type PairingSession,
  pairingEndReasons,
  phonePlatforms,
  type RemoteControl,
  type RemoteState,
} from "./remote-control.ts";

verifies("ports.remote-control", () => {
  typeTest("has exactly the six methods Studio needs", () => {
    expectTypeOf<keyof RemoteControl>().toEqualTypeOf<
      "state" | "setRemote" | "startPairing" | "revoke" | "revokeAll" | "setAllowRiskyRemotely"
    >();
    expectTypeOf<RemoteControl["state"]>().toEqualTypeOf<() => AsyncIterable<RemoteState>>();
    expectTypeOf<RemoteControl["startPairing"]>().toEqualTypeOf<() => Promise<PairingSession>>();
  });

  typeTest("drives a pairing with events, allow, deny, newCode and close", () => {
    expectTypeOf<keyof PairingSession>().toEqualTypeOf<
      "events" | "allow" | "deny" | "newCode" | "close"
    >();
    expectTypeOf<PairingSession["events"]>().toEqualTypeOf<() => AsyncIterable<PairingEvent>>();
    expectTypeOf<PairingSession["newCode"]>().toEqualTypeOf<() => Promise<void>>();
    expectTypeOf<PairingEvent["type"]>().toEqualTypeOf<
      "code" | "check" | "code-ended" | "paired" | "ended"
    >();
  });

  typeTest("keeps only a phone's public data", () => {
    expectTypeOf<keyof PairedPhone>().toEqualTypeOf<
      "id" | "name" | "platform" | "pairedAt" | "lastSeenAt" | "connected"
    >();
  });

  it("lists the reasons a code ends, the reasons a pairing ends and the platforms", () => {
    expect(codeEndReasons).toEqual(["denied", "allow-timed-out", "code-expired", "too-many-tries"]);
    expect(pairingEndReasons).toEqual(["closed", "remote-off", "tunnel-down", "busy"]);
    expect(phonePlatforms).toEqual(["android", "ios"]);
  });
});
