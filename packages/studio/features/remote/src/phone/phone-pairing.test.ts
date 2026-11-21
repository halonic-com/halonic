import type { PairingQrPayload } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type FoundComputer, type PairingStart, problemScreen } from "./phone-pairing.ts";

const payload: PairingQrPayload = {
  hostKey: new Uint8Array(32),
  code: "7KQ2M4XD9TH6",
  hostName: "Acme laptop",
  endpoints: ["tcp://100.64.0.5:4281"],
};

const scanned: PairingStart = { kind: "scanned", payload };

const onWifi: FoundComputer = { id: "a", name: "Acme laptop", route: "wifi" };
const pairedBefore: FoundComputer = { id: "b", name: "Acme desktop", route: "pairedBefore" };

const typed = (computer: FoundComputer): PairingStart => ({
  kind: "typed",
  computer,
  code: "7KQ2M4XD9TH6",
});

verifies("remote.phone-pairing-problems", () => {
  it("brings back the typed route with the tries left for a wrong typed code", () => {
    expect(problemScreen({ kind: "wrongCode", triesLeft: 3 }, typed(onWifi))).toEqual({
      screen: "typedWrong",
      triesLeft: 3,
    });
  });

  it("reads a wrong code on the scanned route as a code that no longer works", () => {
    expect(problemScreen({ kind: "wrongCode", triesLeft: 4 }, scanned)).toEqual({
      screen: "ended",
      noAllow: false,
    });
  });

  it("says the code no longer works, with the Allow reason after the 2-minute wait", () => {
    expect(problemScreen({ kind: "codeEnded" }, scanned)).toEqual({
      screen: "ended",
      noAllow: false,
    });
    expect(problemScreen({ kind: "timedOut" }, typed(onWifi))).toEqual({
      screen: "ended",
      noAllow: true,
    });
  });

  it("tells a code used first apart from Don't allow", () => {
    expect(problemScreen({ kind: "codeUsed" }, scanned)).toEqual({ screen: "used" });
    expect(problemScreen({ kind: "denied" }, scanned)).toEqual({ screen: "refused" });
  });

  it("says Can't reach for a silent computer or an offline phone, never Don't allow", () => {
    expect(problemScreen({ kind: "unreachable" }, typed(onWifi))).toEqual({
      screen: "unreachable",
      wifi: true,
    });
    expect(problemScreen({ kind: "phoneOffline" }, scanned)).toEqual({
      screen: "unreachable",
      wifi: false,
    });
    expect(problemScreen({ kind: "unreachable" }, typed(pairedBefore))).toEqual({
      screen: "unreachable",
      wifi: false,
    });
  });

  it("keeps the two undrawn problems apart", () => {
    expect(problemScreen({ kind: "rateLimited" }, typed(onWifi))).toEqual({
      screen: "rateLimited",
    });
    expect(problemScreen({ kind: "cantConfirm" }, scanned)).toEqual({ screen: "cantConfirm" });
  });
});
