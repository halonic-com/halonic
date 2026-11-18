import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
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

  typeTest("drives a pairing with events, allow, deny and close", () => {
    expectTypeOf<keyof PairingSession>().toEqualTypeOf<"events" | "allow" | "deny" | "close">();
    expectTypeOf<PairingSession["events"]>().toEqualTypeOf<() => AsyncIterable<PairingEvent>>();
    expectTypeOf<PairingEvent["type"]>().toEqualTypeOf<"code" | "check" | "paired" | "ended">();
  });

  typeTest("keeps only a phone's public data", () => {
    expectTypeOf<keyof PairedPhone>().toEqualTypeOf<
      "id" | "name" | "platform" | "pairedAt" | "lastSeenAt" | "connected"
    >();
  });

  it("lists the reasons a pairing ends and the platforms", () => {
    expect(pairingEndReasons).toEqual([
      "denied",
      "allow-timed-out",
      "code-expired",
      "too-many-tries",
      "closed",
      "remote-off",
      "tunnel-down",
      "busy",
    ]);
    expect(phonePlatforms).toEqual(["android", "ios"]);
  });
});
