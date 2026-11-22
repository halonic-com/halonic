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
    expect(problemScreen({ kind: "code-ended" }, scanned)).toEqual({
      screen: "ended",
      noAllow: false,
    });
    expect(problemScreen({ kind: "timeout" }, onWifi)).toEqual({
      screen: "ended",
      noAllow: true,
    });
  });

  it("gives too many tries, a failed handshake and an unreadable answer their own screens", () => {
    expect(problemScreen({ kind: "rate-limited" }, onWifi)).toEqual({ screen: "rateLimited" });
    expect(problemScreen({ kind: "handshake-failed" }, scanned)).toEqual({
      screen: "cantConfirm",
    });
    expect(problemScreen({ kind: "unreadable" }, scanned)).toEqual({ screen: "unreadable" });
  });

  it("shows the generic screen, not a sentence for the person, for a start the page got wrong", () => {
    expect(problemScreen({ kind: "bad-start" }, onWifi)).toEqual({ screen: "generic" });
  });

  it("tells a code used first apart from Don't allow", () => {
    expect(problemScreen({ kind: "code-used" }, scanned)).toEqual({ screen: "used" });
    expect(problemScreen({ kind: "refused" }, scanned)).toEqual({ screen: "refused" });
  });

  it("says Can't reach for a silent computer, never Don't allow", () => {
    expect(problemScreen({ kind: "cant-reach", reason: "timeout" }, onWifi)).toEqual({
      screen: "unreachable",
      wifi: true,
      phoneOffline: false,
    });
    expect(problemScreen({ kind: "cant-reach", reason: "refused" }, pairedBefore)).toEqual({
      screen: "unreachable",
      wifi: false,
      phoneOffline: false,
    });
  });

  it("makes the check about the phone when its own network is down", () => {
    expect(problemScreen({ kind: "cant-reach", reason: "network-down" }, scanned)).toEqual({
      screen: "unreachable",
      wifi: false,
      phoneOffline: true,
    });
    expect(problemScreen({ kind: "cant-reach", reason: "network-down" }, onWifi)).toEqual({
      screen: "unreachable",
      wifi: true,
      phoneOffline: true,
    });
  });
});
