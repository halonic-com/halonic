import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type PairingFrom, problemScreen } from "./phone-pairing.ts";

const scanned: PairingFrom = { route: "qr" };
const onWifi: PairingFrom = { route: "typed", wifi: true };
const pairedBefore: PairingFrom = { route: "typed", wifi: false };

verifies("remote.phone-pairing-problems", () => {
  it("brings back the typed route with the tries left for a wrong typed code", () => {
    expect(problemScreen({ kind: "wrong-code", triesLeft: 3 }, onWifi)).toEqual({
      screen: "typedWrong",
      triesLeft: 3,
    });
  });

  it("reads a wrong code on the scanned route as a code that no longer works", () => {
    expect(problemScreen({ kind: "wrong-code", triesLeft: 4 }, scanned)).toEqual({
      screen: "ended",
      noAllow: false,
    });
  });

  it("says the code no longer works, with the Allow reason after the 2-minute wait", () => {
    for (const kind of ["code-ended", "rate-limited", "handshake-failed"] as const) {
      expect(problemScreen({ kind }, scanned)).toEqual({ screen: "ended", noAllow: false });
    }
    expect(problemScreen({ kind: "timeout" }, onWifi)).toEqual({
      screen: "ended",
      noAllow: true,
    });
  });

  it("tells a code used first apart from Don't allow", () => {
    expect(problemScreen({ kind: "code-used" }, scanned)).toEqual({ screen: "used" });
    expect(problemScreen({ kind: "refused" }, scanned)).toEqual({ screen: "refused" });
  });

  it("says Can't reach for a silent computer or an offline phone, never Don't allow", () => {
    expect(problemScreen({ kind: "cant-reach", reason: "timeout" }, onWifi)).toEqual({
      screen: "unreachable",
      wifi: true,
    });
    expect(problemScreen({ kind: "cant-reach", reason: "network-down" }, scanned)).toEqual({
      screen: "unreachable",
      wifi: false,
    });
    expect(problemScreen({ kind: "cant-reach", reason: "refused" }, pairedBefore)).toEqual({
      screen: "unreachable",
      wifi: false,
    });
  });
});
